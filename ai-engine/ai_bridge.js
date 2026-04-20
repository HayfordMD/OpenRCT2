function main() {
    console.log("Loading AI Bridge Plugin...");

    var socket = network.createSocket();
    
    socket.on('data', function (data) {
        try {
            var lines = data.split('\n');
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                var payload = JSON.parse(lines[i]);
                
                if (payload.type === "action") {
                    if (payload.simulated_action) {
                        console.log("[JS] Emulating Human Action: " + payload.simulated_action);
                        
                        // Topological Height Correction for AI!
                        if (payload.simulated_args && payload.simulated_args.x !== undefined && payload.simulated_args.y !== undefined) {
                            if (["footpathplace", "trackplace", "rideentranceexitplace"].indexOf(payload.simulated_action) !== -1) {
                                var tile = map.getTile(Math.floor(payload.simulated_args.x / 32.0), Math.floor(payload.simulated_args.y / 32.0));
                                if (tile && tile.elements) {
                                    for (var j = 0; j < tile.elements.length; j++) {
                                        if (tile.elements[j].type === 'surface') {
                                            // The engine's internal Z grid coordinates iterate in units of 16 corresponding to OpenRCT2 drawing thresholds!
                                            // Placing z=7 pushes the footpath physically into the underground bedrock, violating placement.
                                            payload.simulated_args.z = tile.elements[j].baseHeight * 16;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if (payload.simulated_action === "staffdrop") {
                            var staffList = map.getAllEntities("staff");
                            var selectedStaff = null;
                            for(var s=0; s<staffList.length; s++) {
                                // staffType === 0 explicitly bounds isolation targets exclusively to Handymen.
                                if (staffList[s].staffType === 0) { 
                                    selectedStaff = staffList[s];
                                    break;
                                }
                            }
                            
                            if (selectedStaff) {
                                var dropArgs = {
                                    type: 2, 
                                    id: selectedStaff.id, 
                                    x: payload.simulated_args.x, 
                                    y: payload.simulated_args.y, 
                                    z: payload.simulated_args.z, 
                                    playerId: 0
                                };
                                context.executeAction("peeppickup", dropArgs, function(res) {
                                    if (res.error) {
                                        socket.write(JSON.stringify({ type: "action_result", success: false }) + "\n");
                                    } else {
                                        socket.write(JSON.stringify({ type: "action_result", success: true }) + "\n");
                                    }
                                });
                            } else {
                                // Instant Failure if mathematical array failed tracing alive Handymen
                                socket.write(JSON.stringify({ type: "action_result", success: false }) + "\n");
                            }
                        } else {
                            // Standard generic OpenRCT2 Execution Hook
                            context.executeAction(payload.simulated_action, payload.simulated_args, function(res) {
                                if (res.error) {
                                    console.log("[JS] Action Failed: " + res.errorTitle);
                                    socket.write(JSON.stringify({ type: "action_result", success: false }) + "\n");
                                } else {
                                    socket.write(JSON.stringify({ type: "action_result", success: true }) + "\n");
                                }
                            });
                        }
                    }
                    
                } else if (payload.type === "reset") {
                    console.log("[JS Plugin] Received Reset request!");
                    // Reset the park environment
                } else if (payload.type === "config") {
                    // Config processing
                }
            }
        } catch (e) {
            console.log("[Bridge] Unrecognized payload: " + data);
        }
    });

    socket.on('error', function (err) {
        console.log("[Bridge Error]: " + err);
        socket = null;
    });

    socket.on('close', function () {
        console.log("Socket connection closed.");
        socket = null;
    });

    socket.connect(1337, '127.0.0.1', function () {
        console.log("Successfully connected to Python AI Brain!");
        socket.write(JSON.stringify({ type: "handshake", msg: "OpenRCT2 is ready." }) + "\n");
        
        // --- TOPOLOGICAL SWEEP ---
        var validTiles = [];
        for (var x = 0; x < map.size.x; x++) {
            for (var y = 0; y < map.size.y; y++) {
                var tile = map.getTile(x, y);
                var isFlat = true;
                var hasWater = false;
                if (tile && tile.elements) {
                    for (var j = 0; j < tile.elements.length; j++) {
                        if (tile.elements[j].type === 'surface') {
                            if (tile.elements[j].slope !== 0) isFlat = false;
                            if (tile.elements[j].waterHeight > 0) hasWater = true;
                        }
                    }
                }
                if (isFlat && !hasWater && validTiles.length < 500) { // Bound to safety array of 500 tiles
                    validTiles.push({x: x * 32, y: y * 32});
                }
            }
        }
        socket.write(JSON.stringify({ type: "topology", grid: validTiles }) + "\n");
        console.log("[JS Plugin] Topological bounds mapped: " + validTiles.length + " tiles");
        
        // --- DIAGNOSTIC SEEDING ---
        for (var i = 0; i < 5; i++) {
            var seed_args = {x: 2048 + (i * 32), y: 1536, z: 16, direction: 255, object: 0, railingsObject: 0, slopeType: 0, slopeDirection: 0, constructFlags: 0};
            var tile_s = map.getTile(Math.floor(seed_args.x / 32), Math.floor(seed_args.y / 32));
            if (tile_s) {
                for (var j = 0; j < tile_s.elements.length; j++) {
                    if (tile_s.elements[j].type === 'surface') { seed_args.z = tile_s.elements[j].baseHeight * 16; break; }
                }
            }
            context.executeAction("footpathplace", seed_args, function(){});
        }
        
        // Globally force the Park Gates open by default so the AI immediately starts receiving foot traffic
        context.executeAction("parksetparameter", { parameter: 1, value: 0 }, function() {
            console.log("[JS Plugin] Global Park Gate Unlocked natively.");
        });
        
        // Multiply simulation game speed natively to blast through training epochs!
        // 0 = Normal, 1 = Fast, 2 = Turbo, 3 = Hyper
        context.executeAction("gamesetspeed", { speed: 3 }, function() {
            console.log("[JS Plugin] Game Simulation Speed maxed to Hyper (3).");
        });
    });

    // Throttle telemetry dynamically using native engine ticks (40 TPS)
    // Sending telemetry every 10 ticks means the AI makes exactly 4 actions per physical second!
    var telemetryTickCount = 0;
    var macroGridCache = [];
    for(var u=0; u<500; u++) macroGridCache.push(0);

    context.subscribe('interval.tick', function () {
        telemetryTickCount++;
        if (telemetryTickCount % 10 !== 0) return;
        
        if (socket !== null) {
            var guestsList = map.getAllEntities("guest");
            
            // --- Phase 11: MACRO-REGIONAL SPATIAL COMPRESSOR ---
            // Natively extract spatial layout into 100 discrete regions every 1 real-world second (40 ticks)!
            if (telemetryTickCount % 40 === 0) {
                 macroGridCache = [];
                 var chunkX = Math.ceil(map.size.x / 10);
                 var chunkY = Math.ceil(map.size.y / 10);

                 for(var cx=0; cx<10; cx++){
                     for(var cy=0; cy<10; cy++){
                         var b_density = 0;
                         var t_height = 0;
                         var total_tiles = 0;
                         
                         for(var x=(cx*chunkX); x<((cx+1)*chunkX); x++) {
                             for(var y=(cy*chunkY); y<((cy+1)*chunkY); y++) {
                                 if(x >= map.size.x || y >= map.size.y) continue;
                                 total_tiles++;
                                 var tile = map.getTile(x, y);
                                 if (tile && tile.elements) {
                                     var hasBuilding = false;
                                     for (var j = 0; j < tile.elements.length; j++) {
                                          var type = tile.elements[j].type;
                                          if (type === 'track' || type === 'footpath') hasBuilding = true;
                                          if (type === 'surface') t_height += tile.elements[j].baseHeight;
                                     }
                                     if (hasBuilding) b_density++;
                                 }
                             }
                         }
                         
                         var avg_height = total_tiles > 0 ? (t_height / total_tiles) : 0;
                         var pct_density = total_tiles > 0 ? (b_density / total_tiles) : 0;
                         
                         // Note: JS pushes variables sequentially. 5 variables per chunk.
                         macroGridCache.push(pct_density);
                         macroGridCache.push(avg_height);
                         macroGridCache.push(0); // Initialize guest population index
                         macroGridCache.push(0); // Initialize biological/litter volume tracking index
                         macroGridCache.push(0); // Initialize infrastructure gateways (Entrances/Exits) tracking index
                     }
                 }

                 // Sort live peep entities into spatial regions safely
                 for (var i = 0; i < guestsList.length; i++) {
                     var px = Math.floor((guestsList[i].x / 32) / chunkX);
                     var py = Math.floor((guestsList[i].y / 32) / chunkY);
                     if (px >= 0 && px < 10 && py >= 0 && py < 10) {
                         var idx = (px * 10 + py) * 5 + 2; 
                         macroGridCache[idx] += 1;
                     }
                 }
                 
                 // Sort live biological anomalies (litter & vomit) into chunks geometrically
                 var littersList = map.getAllEntities("litter");
                 for (var i = 0; i < littersList.length; i++) {
                     var px = Math.floor((littersList[i].x / 32) / chunkX);
                     var py = Math.floor((littersList[i].y / 32) / chunkY);
                     if (px >= 0 && px < 10 && py >= 0 && py < 10) {
                         var idx = (px * 10 + py) * 5 + 3; 
                         macroGridCache[idx] += 1;
                     }
                 }
                 
                 // Phase 14: Extract physical Entrances and Exits into topological Sector constraints!
                 if (map.rides) {
                     for (var r=0; r<map.rides.length; r++) {
                         var r_obj = map.rides[r];
                         if (r_obj && r_obj.stations) {
                             for (var s=0; s<r_obj.stations.length; s++) {
                                 var station = r_obj.stations[s];
                                 if (station) {
                                     // Process Entrance Location
                                     if (station.entrance) {
                                         var e_px = Math.floor((station.entrance.x / 32) / chunkX);
                                         var e_py = Math.floor((station.entrance.y / 32) / chunkY);
                                         if (e_px >= 0 && e_px < 10 && e_py >= 0 && e_py < 10) {
                                             var idx = (e_px * 10 + e_py) * 5 + 4;
                                             macroGridCache[idx] += 1;
                                         }
                                     }
                                     // Process Exit Location
                                     if (station.exit) {
                                         var ex_px = Math.floor((station.exit.x / 32) / chunkX);
                                         var ex_py = Math.floor((station.exit.y / 32) / chunkY);
                                         if (ex_px >= 0 && ex_px < 10 && ex_py >= 0 && ex_py < 10) {
                                             var idx = (ex_px * 10 + ex_py) * 5 + 4;
                                             macroGridCache[idx] += 1;
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
            }


            var totalHappiness = 0;
            var totalNausea = 0;
            var totalLeaving = 0;
            var totalGoHomeThoughts = 0;
            
            for (var i = 0; i < guestsList.length; i++) {
                totalHappiness += guestsList[i].happiness;
                totalNausea += guestsList[i].nausea;
                
                if (guestsList[i].getFlag("leavingPark")) {
                    totalLeaving += 1;
                }
                
                var thoughts = guestsList[i].thoughts;
                if (thoughts) {
                    for (var t = 0; t < thoughts.length; t++) {
                        if (thoughts[t].type === "go_home") {
                            totalGoHomeThoughts += 1;
                        }
                    }
                }
            }
            var avgHappiness = guestsList.length > 0 ? (totalHappiness / guestsList.length) : 0;
            var avgNausea = guestsList.length > 0 ? (totalNausea / guestsList.length) : 0;

            var rides = map.rides;
            var totalRideCustomers = 0;
            if (rides) {
                for (var r = 0; r < rides.length; r++) {
                    if (rides[r]) {
                        totalRideCustomers += (rides[r].totalCustomers || 0);
                    }
                }
            }

            var state = {
                type: "state",
                cash: park.cash,
                bankLoan: park.bankLoan,
                value: park.value,
                companyValue: park.companyValue,
                rating: park.rating,
                guests: park.guests,
                totalAdmissions: park.totalAdmissions,
                avgHappiness: avgHappiness,
                avgNausea: avgNausea,
                leaving: totalLeaving,
                goHomeThoughts: totalGoHomeThoughts,
                rideCustomers: totalRideCustomers,
                totalRides: rides ? rides.length : 0,
                macroGrid: macroGridCache
            };
            try {
                socket.write(JSON.stringify(state) + "\n");
            } catch (e) {
                console.log("Failed to write to socket: " + e);
                socket = null;
            }
        }
    });
    context.subscribe("action.execute", function(e) {
        // We now intercept EVERY SINGLE ACTION in the engine (Paths, Terraforming, Pricing, etc.)
        // But we MUST mathematically filter out UI Hovers (Query Mode). 
        // True Execution commands always use sign bit '0x80000000' which parses as exactly -2147483648!
        if (e.args && e.args.flags !== undefined && e.args.flags >= 0) {
            return;
        }

        try {
            if(socket && socket.write) {
                socket.write(JSON.stringify({
                    type: "intercept",
                    action: e.action,
                    args: e.args
                }) + "\n");
            }
        } catch (err) {}
    });
}


registerPlugin({
    name: 'AI Bridge Plugin',
    version: '1.0',
    authors: ['AI Engine'],
    type: 'remote',
    targetApiVersion: 70,
    main: main
});

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
                    console.log("[JS Plugin] Received Action request: " + payload.action_id);
                    
                    if (payload.action_id === 4) {
                        context.executeAction("staffhire", { staffType: 0 }, function(res) {});
                    } else if (payload.action_id === 5) {
                        context.executeAction("staffhire", { staffType: 1 }, function(res) {});
                    }
                    
                } else if (payload.type === "reset") {
                    console.log("[JS Plugin] Received Reset request!");
                    // Reset the park environment
                } else if (payload.type === "config") {
                    if (payload.mode === "human") {
                        // Initialize Baseline exclusively for the Human Sandbox if park is empty!
                        if (map.rides && map.rides.length === 0) {
                            console.log("[Auto-Setup] Empty Park Detected. Triggering Baseline construction...");
                            buildBaseline();
                        }
                    }
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

    // Send the state over to the AI every single day
    context.subscribe('interval.day', function () {
        if (socket !== null) {
            var guestsList = map.getAllEntities("guest");
            var totalHappiness = 0;
            var totalNausea = 0;
            for (var i = 0; i < guestsList.length; i++) {
                totalHappiness += guestsList[i].happiness;
                totalNausea += guestsList[i].nausea;
            }
            var avgHappiness = guestsList.length > 0 ? (totalHappiness / guestsList.length) : 0;
            var avgNausea = guestsList.length > 0 ? (totalNausea / guestsList.length) : 0;

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
                avgNausea: avgNausea
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

function buildBaseline() {
    console.log("[JS Plugin] Building Baseline Merry-Go-Round...");
    var rideCreateArgs = {
        rideType: 33, // Merry-Go-Round
        rideObject: 11,
        entranceObject: 0,
        colour1: 0, // Set track colours to default
        colour2: 2, 
        inspectionInterval: 2
    };

    context.executeAction("ridecreate", rideCreateArgs, function(res) {
        if (res.error) {
            console.log("Failed to create ride: " + res.errorTitle);
            return;
        }
        
        // Dynamically get the ride ID (defaults to 0 if the park is effectively empty)
        var rideId = (res.result !== undefined && res.result !== null) ? res.result.ride : 0;
        
        var trackPlaceArgs = {
            x: 4032, y: 2368, z: 112,
            direction: 0, ride: rideId, trackType: 266, rideType: 33,
            brakeSpeed: 0, colour: 0, seatRotation: 4, trackPlaceFlags: 0,
            isFromTrackDesign: false
        };

        context.executeAction("trackplace", trackPlaceArgs, function(res2) {
            context.executeAction("rideentranceexitplace", {
                x: 4064, y: 2432, direction: 3, ride: rideId, station: 0, isExit: false
            }, function(res3) {
                context.executeAction("rideentranceexitplace", {
                    x: 4000, y: 2432, direction: 3, ride: rideId, station: 0, isExit: true
                }, function(res4) {
                    context.executeAction("ridesetstatus", {
                         ride: rideId, status: 1
                    }, function(res5) {
                         // Build the Entrance Path connector (X: 4064, Y: 2464)
                         // constructFlags: 1 mathematically dictates this is a Queue Line, NOT a standard path!
                         var pathEntrance = { x: 4064, y: 2464, z: 112, object: 1, railingsObject: 0, direction: 255, slopeType: 0, slopeDirection: 0, constructFlags: 1 };
                         context.executeAction("footpathplace", pathEntrance, function(res6) {
                             
                             // Build the Exit Path connector (X: 4000, Y: 2464)
                             var pathExit = { x: 4000, y: 2464, z: 112, object: 0, railingsObject: 0, direction: 255, slopeType: 0, slopeDirection: 0, constructFlags: 0 };
                             context.executeAction("footpathplace", pathExit, function(res7) {
                                 
                                 // Ensure Park is Open! (Native UI maps exact value: 0 for Open status!)
                                 context.executeAction("parksetparameter", { parameter: 1, value: 0 }, function(res8) {
                                     console.log("[JS Plugin] Merry-Go-Round Baseline Installed, Path Connected, & Park Opened!");
                                 });
                             });
                         });
                    });
                });
            });
        });
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

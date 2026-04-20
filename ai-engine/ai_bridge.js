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
                        context.executeAction(payload.simulated_action, payload.simulated_args, function(res) {
                            if (res.error) {
                                console.log("[JS] Action Failed: " + res.errorTitle);
                            }
                        });
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
                rideCustomers: totalRideCustomers
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

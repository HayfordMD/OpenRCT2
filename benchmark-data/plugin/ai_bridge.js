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
                    
                    if (payload.action_id === 1) {
                        // Open the Park
                        context.executeAction("parksetparameter", {
                            parameter: 1
                        }, function (result) {
                            if (result.error) {
                                console.log("Failed to open park: " + result.errorMessage);
                            } else {
                                console.log("Successfully Opened Park!");
                            }
                        });
                    } else if (payload.action_id === 2) {
                        buildBaseline();
                    }
                    // Add more action mapping logic here!
                } else if (payload.type === "reset") {
                    console.log("[JS Plugin] Received Reset request!");
                    // Reset the park environment
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
        
        // Auto-open park relies on exact scenario configuration. Removed to prevent invalid parameter errors.
        
        // Initialize Baseline if this park has no rides!
        if (map.rides && map.rides.length === 0) {
            console.log("[Auto-Setup] Empty Park Detected. Triggering Baseline construction...");
            buildBaseline();
        }
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
        if (e.action === "ridecreate" || e.action === "trackplace" || e.action === "rideentranceexitplace" || e.action === "ridesetstatus") {
            try {
                if(socket && socket.write) {
                    socket.write(JSON.stringify({
                        type: "intercept",
                        action: e.action,
                        args: e.args
                    }) + "\n");
                }
            } catch (err) {}
        }
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
                         console.log("[JS Plugin] Merry-Go-Round Baseline Installed & Opened!");
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

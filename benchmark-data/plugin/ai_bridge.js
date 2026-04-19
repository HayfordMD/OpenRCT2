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
        
        // Auto-open park on startup
        context.executeAction("parksetparameter", { parameter: 1 }, function (res) {
            console.log("[Auto-Setup] Opened the Park Gates.");
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
}

registerPlugin({
    name: 'AI Bridge Plugin',
    version: '1.0',
    authors: ['AI Engine'],
    type: 'remote',
    targetApiVersion: 70,
    main: main
});

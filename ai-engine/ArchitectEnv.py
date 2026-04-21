import gymnasium as gym
from gymnasium import spaces
import numpy as np
import socket
import json
import time
import threading

class ArchitectEnv(gym.Env):
    """Custom Environment that follows gym interface for OpenRCT2"""
    metadata = {'render.modes': ['human']}

    def __init__(self, host='127.0.0.1', port=1337):
        super(ArchitectEnv, self).__init__()
        
        self.host = host
        self.port = port
        self.server_socket = None
        self.client_conn = None
        self.state = None
        self.valid_grid = None
        self.last_ride_customers = 0
        self.last_total_rides = 0
        self.last_action_success = True
        
        # Start the socket server in the background
        self._start_server()
        
        print("Waiting for JS Topology sweep to build Neural Generator...")
        timeout = 0
        while self.valid_grid is None:
            time.sleep(0.1)
            timeout += 1
            if timeout > 300:
                raise TimeoutError("Waited 30 seconds for Topology Sweep from OpenRCT2 JS Bridge.")
                
        self.action_dictionary = {}
        self._load_human_actions()
        
        # Action Space maps uniquely to structural actions ONLY!
        self.action_space = spaces.Discrete(max(1, len(self.action_dictionary)))

        # 513 variables! (13 base variables + 500 spatial cells tracing entrances geometrically)
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(513,), dtype=np.float32)



    def _load_human_actions(self):
        import glob
        import os
        
        log_dir = r"C:\Users\hayfo\source\OpenRCT2\logs"
        human_logs = glob.glob(os.path.join(log_dir, "A-latest-human-build-*.log"))
        
        # Add Idle action as default Action 0
        self.action_dictionary[0] = {"action": "Idle", "args": {}}
        action_idx = 1
        
        if not human_logs:
            print("No Human Sandbox Logs found! Defaulting to Idle only.")
            return

        with open(human_logs[0], "r") as f:
            content = f.read()
            
        blocks = content.split("[INTERCEPT] Action: ")[1:]
        unique_hashes = set()
        
        for block in blocks:
            lines = block.split("\n", 1)
            action_name = lines[0].strip()
            
            # Blacklist Game-Ending Commands (e.g., Pausing the simulation engine)
            if action_name in ["pausetoggle", "gamesetspeed"]:
                continue
            
            try:
                json_str = lines[1].strip()
                if "Listening for" in json_str:
                    json_str = json_str.split("Listening for")[0].strip()
                    
                args_dict = json.loads(json_str)
                if "flags" in args_dict:
                    del args_dict["flags"]
                    
                # Force sequence isolation to guarantee pure unique arrays
                action_hash = action_name + json.dumps(args_dict, sort_keys=True)
                
                if action_hash not in unique_hashes:
                    unique_hashes.add(action_hash)
                    self.action_dictionary[action_idx] = {
                        "action": action_name,
                        "args": args_dict
                    }
                    action_idx += 1
            except Exception as e:
                pass
                
        # =========================================================
        # PHASE 9: SYNTHETIC PROCEDURAL EXPANSION
        # Shattering the Human action bounds to enable map-wide organic placement
        # =========================================================
        
        # Inject 40 generalized Ride Creation intents (Flat Rides + Coasters)
        for r_type in range(1, 41):
            for r_obj in range(0, 3):
                self.action_dictionary[action_idx] = {
                    "action": "ridecreate",
                    "args": {"rideType": r_type, "rideObject": r_obj, "entranceObject": 0, "colour1": 0, "colour2": 0, "inspectionInterval": 2}
                }
                action_idx += 1
                
        # Generate spatial coordinate matrix across VALID TOPOLOGY ONLY!
        for coord in self.valid_grid:
            x = coord["x"]
            y = coord["y"]
            z = coord.get("z", 16)
            
            for direction in range(0, 4):
                    # Footpath Spawning Matrix
                    self.action_dictionary[action_idx] = {
                        "action": "footpathplace",
                        "args": {"x": x, "y": y, "z": z, "direction": 255, "object": 0, "railingsObject": 0, "slopeType": 0, "slopeDirection": 0, "constructFlags": 0}
                    }
                    action_idx += 1
                    
                    # Track and Entrance Spawning Matrix (Bound to 6 distinct rides)
                    for r_id in range(0, 6):
                        # Track Straight (trackType 0)
                        self.action_dictionary[action_idx] = {
                            "action": "trackplace",
                            "args": {"x": x, "y": y, "z": z, "direction": direction, "ride": r_id, "trackType": 0, "rideType": 4, "brakeSpeed": 0, "colour": 0, "seatRotation": 0, "trackPlaceFlags": 0, "isFromTrackDesign": False}
                        }
                        action_idx += 1
                        
                        # Track Curve (trackType 1)
                        self.action_dictionary[action_idx] = {
                            "action": "trackplace",
                            "args": {"x": x, "y": y, "z": z, "direction": direction, "ride": r_id, "trackType": 1, "rideType": 4, "brakeSpeed": 0, "colour": 0, "seatRotation": 0, "trackPlaceFlags": 0, "isFromTrackDesign": False}
                        }
                        action_idx += 1
                        
                        # Ride Entrance
                        self.action_dictionary[action_idx] = {
                            "action": "rideentranceexitplace",
                            "args": {"ride": r_id, "station": 0, "isExit": False, "x": x, "y": y, "direction": direction}
                        }
                        action_idx += 1
                        
                        # Ride Exit
                        self.action_dictionary[action_idx] = {
                            "action": "rideentranceexitplace",
                            "args": {"ride": r_id, "station": 0, "isExit": True, "x": x, "y": y, "direction": direction}
                        }
                        action_idx += 1

        print(f"[Sandbox Ingestion] Procedurally Synthesized Action Space! Expanded to {len(self.action_dictionary)} organic neural nodes!")

    def _start_server(self):
        print(f"Starting OpenRCT2 Gym Environment on {self.host}:{self.port}...")
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen()
        
        def accept_connections():
            while True:
                conn, addr = self.server_socket.accept()
                print(f"[ENV] Game connected from {addr}")
                self.client_conn = conn
                self._handle_client(conn)
        
        self.server_thread = threading.Thread(target=accept_connections, daemon=True)
        self.server_thread.start()

    def _handle_client(self, conn):
        try:
            buffer = ""
            while True:
                data = conn.recv(1024)
                if not data: break
                
                buffer += data.decode('utf-8')
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    try:
                        message = json.loads(line)
                        if message.get("type") == "state":
                            self.state = message
                        elif message.get("type") == "topology":
                            self.valid_grid = message.get("grid", [])
                        elif message.get("type") == "action_result":
                            self.last_action_success = message.get("success", False)
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            print(f"[ENV ERROR] {e}")
            self.client_conn = None

    def _get_obs(self):
        # Wait for the Game to connect initially!
        timeout = 0
        while self.client_conn is None:
            time.sleep(0.1)
            timeout += 1
            if timeout > 300: # 30 seconds
                raise TimeoutError("Waited 30 seconds for OpenRCT2 engine to start up. Connection failed.")

        # Wait until we receive the first state payload from the Javascript Plugin
        timeout = 0
        while self.state is None:
            if not self.client_conn:
                raise ConnectionError("Lost connection to OpenRCT2 Engine! Aborting training.")
            
            time.sleep(0.01)
            timeout += 1
            if timeout > 3000: # 30 seconds
                raise TimeoutError("Waited 30 seconds for next game tick. Did the game crash?")
        
        base_obs = np.array([
            float(self.state.get("cash", 0)),
            float(self.state.get("bankLoan", 0)),
            float(self.state.get("value", 0)),
            float(self.state.get("companyValue", 0)),
            float(self.state.get("rating", 0)),
            float(self.state.get("guests", 0)),
            float(self.state.get("totalAdmissions", 0)),
            float(self.state.get("avgHappiness", 0)),
            float(self.state.get("avgNausea", 0)),
            float(self.state.get("leaving", 0)),
            float(self.state.get("goHomeThoughts", 0) / 10.0),
            float(self.state.get("rideCustomers", 0) / 100.0),
            float(self.state.get("totalRides", 0))
        ], dtype=np.float32)
        
        macro_grid = self.state.get("macroGrid", [0.0] * 500)
        full_obs = np.concatenate([base_obs, np.array(macro_grid, dtype=np.float32)])
        return full_obs

    def step(self, action):
        """
        Execute one action, send it to JS over the socket, and wait for the result
        """
        # Clear the old state so we strictly wait for the next incoming telemetry payload
        self.state = None 
        
        chosen_action = self.action_dictionary.get(int(action), self.action_dictionary[0])
        action_name = chosen_action["action"]
        
        if self.client_conn and action_name != "Idle":
            try:
                action_payload = json.dumps({
                    "type": "action", 
                    "action_id": int(action),
                    "simulated_action": action_name,
                    "simulated_args": chosen_action["args"]
                }) + "\n"
                self.client_conn.sendall(action_payload.encode('utf-8'))
            except Exception as e:
                print(f"Error sending action: {e}")
        
        # Wait for the next Day's telemetry to arrive
        obs = self._get_obs()
        
        # Phase 15: Completely eradicated Financial & Nausea constraints from the Architectural matrix.
        # It is NO LONGER punished for organically dropping park cash to generate structures!
        reward = 0.0
        
        admissions = obs[6]
        leaving = obs[9]
        ride_customers = obs[11]
        current_rides = obs[12]
        
        # If the Architect mathematically succeeds at adding Rides structurally directly to the geometry:
        if current_rides > self.last_total_rides:
            print(f"[Architect Matrix] +75.0 REWARD - SUCCESSFULLY BOUND ACTIVE OPERABLE RIDE TO TOPOLOGY!")
            reward += 75.0
            self.last_total_rides = current_rides

        # Penalize engine-rejected physics anomalies heavily to train valid bounding natively.
        if not self.last_action_success:
            reward -= 5.0
            
        # Reset the asynchronous validation tracker for the next execution frame
        self.last_action_success = True
        
        # Delta Activation Node: Instant Massive Dopamine Hit when a new customer boards!
        new_customers = max(0, ride_customers - self.last_ride_customers)
        if new_customers > 0:
            reward += 50.0 * new_customers
            print(f"==================================================")
            print(f"!!! JACKPOT: GUEST ENTERED A CONNECTED RIDE !!!")
            print(f"!!! Dopamine Reward Spike: +{50.0 * new_customers} Points !!!")
            print(f"==================================================")
            
        self.last_ride_customers = ride_customers
            
        # Make the AI's internal monologue completely visible to the human!
        print(f"[AI] Action: {action_name} | Tkts: {admissions} | RideCstmrs: {ride_customers} | Leaving: {leaving} | Reward: {reward:.4f}")
        
        done = False
        info = {}
        
        return obs, reward, done, False, info

    def reset(self, seed=None, options=None):
        """
        Reset the environment to standard starting conditions
        """
        super().reset(seed=seed)
        
        if self.client_conn:
            try:
                reset_payload = json.dumps({"type": "reset"}) + "\n"
                self.client_conn.sendall(reset_payload.encode('utf-8'))
            except:
                pass
                
        self.state = None
        self.last_ride_customers = 0
        obs = self._get_obs()
        return obs, {}

    def close(self):
        if self.client_conn:
            self.client_conn.close()
        if self.server_socket:
            self.server_socket.close()

if __name__ == "__main__":
    env = ArchitectEnv()
    print("Test Architect Environment Started. Waiting for game to connect...")
    obs, info = env.reset()
    
    for _ in range(3):
        print("Taking action 2 (Build Baseline)...")
        obs, reward, done, _, info = env.step(2)
        print(f"Reward: {reward:.2f} | Cash: {obs[0]} | Value: {obs[2]}")

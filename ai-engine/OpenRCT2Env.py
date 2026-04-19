import gymnasium as gym
from gymnasium import spaces
import numpy as np
import socket
import json
import time
import threading

class OpenRCT2Env(gym.Env):
    """Custom Environment that follows gym interface for OpenRCT2"""
    metadata = {'render.modes': ['human']}

    def __init__(self, host='127.0.0.1', port=1337):
        super(OpenRCT2Env, self).__init__()
        
        # Action Space: (e.g. 0=Do Nothing, 1=Build Coaster A, 2=Build Flat Ride B, etc.)
        # We start simple: 0 = Do Nothing, 1-3 = Build pre-approved Coaster, 4-7 = Build flat rides
        self.action_space = spaces.Discrete(8)

        # Observation Space: Cash, Bank Loan, Park Value, Company Value, Park Rating, Guest Count, Admissions
        # We use a Box (continuous values) for these 7 numerical metrics
        self.observation_space = spaces.Box(
            low=np.array([-np.inf, 0.0, 0.0, -np.inf, 0.0, 0.0, 0.0]), 
            high=np.array([np.inf, np.inf, np.inf, np.inf, 1000.0, 10000.0, 10000.0]), 
            dtype=np.float32
        )

        self.host = host
        self.port = port
        self.server_socket = None
        self.client_conn = None
        self.state = None
        
        # Start the socket server in the background
        self._start_server()

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
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            print(f"[ENV ERROR] {e}")
            self.client_conn = None

    def _get_obs(self):
        # Wait until we receive the first state payload from the Javascript Plugin
        timeout = 0
        while self.state is None:
            if not self.client_conn:
                raise ConnectionError("Lost connection to OpenRCT2 Engine! Aborting training.")
            
            time.sleep(0.01)
            timeout += 1
            if timeout > 3000: # 30 seconds
                raise TimeoutError("Waited 30 seconds for next game tick. Did the game crash?")
        
        return np.array([
            float(self.state.get("cash", 0)),
            float(self.state.get("bankLoan", 0)),
            float(self.state.get("value", 0)),
            float(self.state.get("companyValue", 0)),
            float(self.state.get("rating", 0)),
            float(self.state.get("guests", 0)),
            float(self.state.get("totalAdmissions", 0))
        ], dtype=np.float32)

    def step(self, action):
        """
        Execute one action, send it to JS over the socket, and wait for the result
        """
        # Clear the old state so we strictly wait for the next incoming telemetry payload
        self.state = None 
        
        if self.client_conn:
            try:
                action_payload = json.dumps({"type": "action", "action_id": int(action)}) + "\n"
                self.client_conn.sendall(action_payload.encode('utf-8'))
            except Exception as e:
                print(f"Error sending action: {e}")
        
        # Wait for the next Day's telemetry to arrive
        obs = self._get_obs()
        
        # Reward function: 
        # Increase in park rating and cash are good. Debt is heavily penalized.
        cash = obs[0]
        loan = obs[1]
        park_value = obs[2]
        rating = obs[4]
        guests = obs[5]
        admissions = obs[6]  # Cumulative lifetime guests who paid for tickets
        
        # Reward Mapping Strategy:
        # Admissions represent the lifeblood of ride tickets and park entry fees (+ massive weight)
        # Park Value represents active ride construction (+ strong weight)
        # Cash on hand (+ slight weight)
        # Debt/Loans (- penalize)
        reward = (admissions * 1.5) + (park_value * 0.05) + (cash * 0.01) + (rating * 0.5) - (loan * 0.05)
        
        # Make the AI's internal monologue completely visible to the human!
        print(f"[AI] Action: {action} | Rating: {rating} | Cash: ${cash:.2f} | Tickets: {admissions} | Reward: {reward:.4f}")
        
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
        obs = self._get_obs()
        return obs, {}

    def close(self):
        if self.client_conn:
            self.client_conn.close()
        if self.server_socket:
            self.server_socket.close()

if __name__ == "__main__":
    env = OpenRCT2Env()
    print("Test Environment Started. Waiting for game to connect...")
    obs, info = env.reset()
    
    for _ in range(3):
        print("Taking action 2 (Build Baseline)...")
        obs, reward, done, _, info = env.step(2)
        print(f"Reward: {reward:.2f} | Cash: {obs[0]} | Value: {obs[2]}")

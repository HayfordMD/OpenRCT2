import os
import sys
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
import glob
import re
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
from OpenRCT2Env import OpenRCT2Env

# Set up logging to OpenRCT2/logs folder
log_dir = r"C:\Users\hayfo\source\OpenRCT2\logs"
os.makedirs(log_dir, exist_ok=True)

# 1. Strip the A-latest badge from all older logs to maintain exactly one latest badge
old_latest = glob.glob(os.path.join(log_dir, "A-latest-ai-train-*.log"))
for old_log in old_latest:
    clean_name = os.path.basename(old_log).replace("A-latest-", "")
    os.rename(old_log, os.path.join(log_dir, clean_name))

timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
log_file = os.path.join(log_dir, f"A-latest-ai-train-{timestamp}.log")

# Create a rotating file handler: max 30MB, keep 3 backups
handler = RotatingFileHandler(log_file, maxBytes=30*1024*1024, backupCount=3)
logging.basicConfig(handlers=[handler], level=logging.INFO, format="%(message)s")

# Redirect ALL print statements to the log file as well as the console
class PrintLogger:
    def write(self, message):
        if message.strip() != "":
            logging.info(message.strip())
        sys.__stdout__.write(message)
    def flush(self):
        sys.__stdout__.flush()

sys.stdout = PrintLogger()

def main():
    print("========================================")
    print("  Initializing OpenRCT2 Deep RL Bridge  ")
    print("========================================")
    
    # Instantiate our custom Gymnasium environment
    env = OpenRCT2Env()
    
    # Wrap it in a DummyVecEnv, required by stable_baselines3
    vec_env = DummyVecEnv([lambda: env])
    
    MODEL_PATH = "ppo_openrct2_model_v4"
    
    # Load existing model if it exists, otherwise create a new one
    try:
        model = PPO.load("ppo_openrct2_model_v4", env=vec_env)
        print("Loaded existing V4 PPO model.")
    except Exception as e:
        print("No existing V4 model found or incompatible shape. Initializing new model.")
        model = PPO("MlpPolicy", vec_env, verbose=1, tensorboard_log="./ppo_rct2_tensorboard/")

    print("Starting Training Loop (Phase 8: Guest Telemetry Opt)...")
    
    # Train forever in segments
    while True:
        model.learn(total_timesteps=10000, reset_num_timesteps=False)
        model.save("ppo_openrct2_model_v4")
        print("Model state saved locally.")
    
    print("\nEvaluating trained model...")
    obs = vec_env.reset()
    for i in range(10):
        action, _states = model.predict(obs, deterministic=True)
        obs, reward, done, info = vec_env.step(action)
        print(f"Eval Step {i} | Action chosen: {action} | Current Reward: {reward}")
        
    # Clean up
    env.close()

if __name__ == "__main__":
    main()

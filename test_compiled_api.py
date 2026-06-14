import subprocess
import time
import urllib.request
import urllib.error
import sys
import os

def test_api():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    exe_path = os.path.join(script_dir, "dist", "Proyecto_Riesgo_Mercado.exe")
    print(f"Starting {exe_path} on port 8090...")
    
    # Set PORT environment variable to force launcher to use port 8090
    env = os.environ.copy()
    env["PORT"] = "8090"
    
    server_process = subprocess.Popen(
        [exe_path],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(15) # Wait for server to start (accommodate UPX/LZMA extraction)
    
    # Check if server is running
    if server_process.poll() is not None:
        print("Server process exited early!")
        sys.exit(1)
        
    print("Reading AMD CSV file...")
    csv_path = "Datos históricos de AMD (AMD).csv"
    if not os.path.exists(csv_path):
        print(f"AMD CSV file not found at {csv_path}")
        server_process.terminate()
        sys.exit(1)
        
    with open(csv_path, 'rb') as f:
        csv_data = f.read()
        
    # --- 1. Test Upload API ---
    print("\n--- Testing Upload API ---")
    url_upload = "http://localhost:8090/api/upload?ticker=AMD"
    req_upload = urllib.request.Request(
        url_upload,
        data=csv_data,
        headers={'Content-Type': 'text/csv'}
    )
    
    upload_success = False
    try:
        with urllib.request.urlopen(req_upload) as response:
            resp_code = response.getcode()
            resp_body = response.read().decode('utf-8')
            print(f"Upload Response code: {resp_code}")
            print(f"Upload Response body: {resp_body}")
            if resp_code == 200 and '"success": true' in resp_body:
                upload_success = True
    except urllib.error.HTTPError as e:
        print(f"Upload HTTP Error: {e.code}")
        try:
            print(f"Upload HTTP Response: {e.read().decode('utf-8')}")
        except Exception:
            pass
    except Exception as e:
        print(f"Upload request failed: {e}")
        
    # --- 2. Test Delete API ---
    if upload_success:
        print("\n--- Testing Delete API ---")
        url_delete = "http://localhost:8090/api/delete?ticker=AMD"
        req_delete = urllib.request.Request(
            url_delete,
            data=b"", # Empty POST body
            headers={'Content-Type': 'application/json'}
        )
        try:
            with urllib.request.urlopen(req_delete) as response:
                resp_code = response.getcode()
                resp_body = response.read().decode('utf-8')
                print(f"Delete Response code: {resp_code}")
                print(f"Delete Response body: {resp_body}")
        except urllib.error.HTTPError as e:
            print(f"Delete HTTP Error: {e.code}")
            try:
                print(f"Delete HTTP Response: {e.read().decode('utf-8')}")
            except Exception:
                pass
        except Exception as e:
            print(f"Delete request failed: {e}")
            
    print("\nTerminating server...")
    server_process.terminate()
    try:
        server_process.wait(timeout=5)
        print("Server terminated successfully.")
    except Exception as e:
        print(f"Error terminating server: {e}")
        server_process.kill()

if __name__ == '__main__':
    test_api()

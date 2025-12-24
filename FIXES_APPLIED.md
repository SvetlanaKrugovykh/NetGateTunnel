# NetGateTunnel - Port EADDRINUSE Error Fix

## Problem

When a tunnel client disconnected or failed to register, the server would fail on reconnection attempts with:
```
Error: listen EADDRINUSE: address already in use 91.220.106.3:8778
```

Even though the tunnel was supposedly unregistered (showing `count: 0`), the port remained bound.

## Root Causes

1. **OS TIME_WAIT State**: When a socket closes, the OS keeps it in TIME_WAIT state (30-60 seconds) to prevent port reuse issues. No proper handling of this was in place.

2. **Incomplete Socket Cleanup**: Pending connections and active data sockets weren't being properly destroyed before closing the server listener.

3. **No Retry Mechanism**: Failed registration attempts would immediately give up, rather than waiting for the port to become available.

## Solutions Applied

### 1. Enhanced Socket Cleanup in `tunnel-manager.js`

**Modified `unregisterTunnel()` function:**
- Added try-catch blocks for socket destruction to handle errors gracefully
- Properly clears the connections Map
- Closes all pending connections associated with the tunnel
- Adds a 100ms delay after closing to allow OS to release the port

### 2. Automatic Retry for Port Registration

**Added `registerTunnelWithRetry()` function:**
- Automatically retries up to 3 times with 500ms delay between attempts
- Only retries on `EADDRINUSE` errors (specific to port conflicts)
- Logs retry attempts for debugging
- Other errors are immediately rejected

### 3. Improved Error Handling

**Enhanced `registerTunnels()` client disconnect handler in `index.js`:**
- Added try-catch wrapper around tunnel unregistration
- Prevents unhandled promise rejections
- Logs any errors during cleanup

## How It Works Now

1. **Client registers tunnel**: Port is successfully bound
2. **Connection fails or client disconnects**: 
   - Server immediately starts cleanup
   - All active and pending connections are destroyed
   - Server listener is closed
   - 100ms delay ensures OS releases port
3. **Client reconnects**: 
   - Registration attempt is made
   - If port is still in TIME_WAIT: automatically retries up to 3 times
   - After retry succeeds, tunnel is properly registered
4. **Result**: No more EADDRINUSE errors on quick reconnection

## Testing

To verify the fix works:

```bash
# 1. Start the server
node server/index.js

# 2. Start a client
node client/index.js

# 3. Test disconnect/reconnect cycles:
# - Kill the client (Ctrl+C)
# - Immediately restart it
# - Should succeed without EADDRINUSE errors

# 4. Check logs for retry messages:
# [WARN] Port in use, retrying... attempt: 1, maxRetries: 3
```

## Files Modified

- `server/modules/tunnel-manager.js` - Added retry logic and improved cleanup
- `server/index.js` - Added error handling for cleanup operations

## Performance Impact

- Minimal: Retry delay only applies when port is actually in TIME_WAIT
- Normal operation: No additional delay
- Worst case: 1.5 seconds total (3 retries × 500ms) before final failure

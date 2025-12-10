# x402 Pay-Per-View Video Streaming

A pay-per-segment video streaming server using the [x402 payment protocol](https://github.com/coinbase/x402). Each video segment requires a micropayment ($0.001 USDC) before playback.

## How It Works

1. Video is split into HLS segments using FFmpeg
2. The playlist (`.m3u8`) is served for free
3. Each segment (`.ts`) requires payment via x402
4. After payment, the segment is unlocked for the user's session
5. Video plays segment by segment, with payment required for each

## Prerequisites

- Node.js 18+
- FFmpeg (for video segmentation)
- A crypto wallet with Base Sepolia testnet USDC (for testing)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Prepare Your Video

Place your source video in the project root and run FFmpeg to create HLS segments:

```bash
mkdir -p segments

ffmpeg -i video.mp4 \
  -codec: copy \
  -start_number 0 \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename 'segments/segment_%03d.ts' \
  segments/playlist.m3u8
```

#### FFmpeg Options Explained

| Option | Description |
|--------|-------------|
| `-i video.mp4` | Input video file |
| `-codec: copy` | Copy streams without re-encoding (fast, preserves quality) |
| `-start_number 0` | Start segment numbering from 0 |
| `-hls_time 6` | Target segment duration in seconds |
| `-hls_list_size 0` | Include all segments in playlist (0 = unlimited) |
| `-hls_segment_filename` | Pattern for segment filenames |

For re-encoding (if codec copy doesn't work):

```bash
ffmpeg -i video.mp4 \
  -c:v libx264 -c:a aac \
  -start_number 0 \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename 'segments/segment_%03d.ts' \
  segments/playlist.m3u8
```

### 3. Configure Payment Settings

Edit `server.js` to set your wallet address:

```javascript
const RECEIVER_ADDRESS = '0xYourWalletAddress';
const PRICE_PER_SEGMENT = '$0.001';  // Price in USD
```

### 4. Start the Server

```bash
# Production mode (payments required)
npm start

# Demo mode (payments bypassed)
DEMO_MODE=true npm start
```

### 5. Open the Player

Navigate to `http://localhost:3000` in your browser.

## Project Structure

```
x402_video/
├── server.js           # Express server with x402 middleware
├── public/
│   └── index.html      # HLS video player with payment UI
├── segments/
│   ├── playlist.m3u8   # HLS playlist
│   └── segment_XXX.ts  # Video segments
├── package.json
├── Dockerfile
└── README.md
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEMO_MODE` | Set to `true` to bypass payments | `false` |
| `PORT` | Server port | `3000` |

### Payment Settings (in server.js)

| Setting | Description |
|---------|-------------|
| `RECEIVER_ADDRESS` | Your wallet address to receive payments |
| `PRICE_PER_SEGMENT` | Price per segment (e.g., `'$0.001'`) |
| `network` | Blockchain network (`'base-sepolia'` for testnet, `'base'` for mainnet) |

## Docker

### Build the Image

```bash
docker build -t x402-video .
```

### Run the Container

```bash
# With payments enabled
docker run -p 3000:3000 x402-video

# With demo mode
docker run -p 3000:3000 -e DEMO_MODE=true x402-video
```

### Using Your Own Video

Mount a volume with your video segments:

```bash
docker run -p 3000:3000 -v /path/to/your/segments:/app/segments x402-video
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Video player UI |
| `GET /video/playlist.m3u8` | HLS playlist (free) |
| `GET /video/segment/:id` | Video segment (requires payment) |
| `GET /pay/:id` | Payment page for a segment |
| `GET /api/check-paid/:id` | Check if segment is paid |

## How Payment Works

1. **Player requests segment** - HLS.js tries to load the next segment
2. **Server returns 402** - If not paid, returns "Payment Required"
3. **Paywall appears** - User sees payment modal
4. **User pays** - Opens x402 payment page, connects wallet, pays USDC
5. **Session updated** - Server records payment in user's session
6. **Segment delivered** - Video segment streams to player
7. **Repeat** - Process repeats for each segment

## Testing with Base Sepolia

1. Add Base Sepolia to MetaMask:
   - Network: Base Sepolia
   - RPC: `https://sepolia.base.org`
   - Chain ID: `84532`
   - Currency: ETH

2. Get testnet ETH from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

3. Get testnet USDC from [Circle Faucet](https://faucet.circle.com/)

## Troubleshooting

### Video downloads instead of playing
- Make sure you're accessing `http://localhost:3000` (the player page)
- Don't access segment URLs directly

### Payment not detected
- Check browser console for errors
- Ensure cookies are enabled (session tracking)
- Try refreshing the page after payment

### FFmpeg errors
- Ensure FFmpeg is installed: `ffmpeg -version`
- Try re-encoding instead of codec copy
- Check input video format compatibility

## License

MIT

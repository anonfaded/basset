# Demucs Music Separation Setup Guide

## Overview
Basset now uses **Demucs** for music removal on macOS and Linux, while Windows continues to use Spleeter.

## Installation Requirements

### macOS & Linux
Install Demucs via pip:
```bash
pip install demucs
```

### Verify Installation
```bash
demucs --help
```
If it works, you're ready to go!

## How It Works

### GPU Mode (Recommended)
- **Model**: `htdemucs` (best quality)
- **Device**: Apple Silicon (MPS) / Intel Macs
- **Speed**: ~1 minute processing
- **Command**: `demucs --device mps --two-stems=vocals -n htdemucs --mp3 --mp3-bitrate 192 {file}`

### CPU Mode
- **Model**: `hdemucs_mmi` (lightweight)
- **Device**: CPU only
- **Speed**: ~2-2.5 minutes processing
- **Command**: `demucs --device cpu --two-stems=vocals -n hdemucs_mmi --mp3 --mp3-bitrate 192 {file}`

## In Basset App

1. **Select** an audio/video file
2. **Click** "Remove Music" button
3. **Choose** device preference:
   - GPU (faster, better quality)
   - CPU (works on all systems)
4. **Wait** for processing to complete
5. **Output** files saved to: `~/Downloads/Basset/vocals_YYYY-MM-DD_HH-mm-ss.mp3`

## Output Files
- **Location**: `~/Downloads/Basset/`
- **Format**: MP3 with 192kbps bitrate
- **Filename**: `vocals_[timestamp].mp3`
- **Example**: `vocals_2026-01-20_14-30-45.mp3`

## Supported Formats
- MP3, WAV, FLAC, OGG, M4A, OPUS
- Video files (MP4, MKV, etc.) - audio extracted automatically

## Troubleshooting

**Error: "Demucs not installed"**
```bash
pip install demucs
```

**Error: "Command not found"**
- Verify installation: `which demucs`
- May need to restart terminal or use full path

**Slow Processing?**
- Use CPU mode (hdemucs_mmi) instead
- Check system resources
- Close other applications

## Model Details

| Model | Device | Speed | Quality | Size |
|-------|--------|-------|---------|------|
| htdemucs | GPU | 1:06 | Excellent | Fast |
| hdemucs_mmi | CPU | 2-2.5m | Good (7.7 dB SDR) | Lightweight |

## Windows Users
Windows continues to use **Spleeter** for music removal (no changes required).

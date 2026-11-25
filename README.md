# FunnyBoard

A little more joy in every keystroke. A desktop writing space with wooden mechanical sounds by default, six sound profiles, and a custom sound for any physical key.

## Install and open

**Ubuntu / Debian:** open `release/funnyboard_1.0.4_amd64.deb` with your software installer, or run:

```bash
sudo apt install ./release/funnyboard_1.0.4_amd64.deb
```

Then open **FunnyBoard** from your applications menu. The installer bundles everything; Node.js and Python are not needed.

**Portable Linux:** make `release/FunnyBoard-1.0.4.AppImage` executable in its file properties and open it. AppImage requires FUSE. If FUSE is unavailable, run `./FunnyBoard-1.0.4.AppImage --appimage-extract` and open `squashfs-root/funnyboard`. The Debian installer is recommended on Ubuntu because it also configures the Chromium sandbox.

**Windows and macOS:** native installer builds are configured and can be generated on their respective operating systems using the commands below or the included GitHub Actions workflow. Those installers have not been built or tested in this Linux workspace. Release builds are unsigned unless signing credentials are supplied.

## Use it

1. Start typing in the writing space. Wooden mechanical sounds are selected automatically.
2. Open **Set the mood** to select **Wooden mechanical**, **Creamy switches**, **Vintage typewriter**, **Pocket arcade**, **Bubble pop**, or **Durka**. Each includes a preview. Durka continues smoothly as you type, fades when you pause, and resumes from its previous position. The other profiles have distinct sounds for regular keys, Space, and Enter.
3. The app starts with no key selected. Click a key on the visual keyboard to customize it, then choose another built-in sound or drop an audio file on the sound panel. Click that key again or use **Clear selection** to deselect it; its saved sound stays assigned. **Pick any key** accepts every key, including Esc and numpad keys. Click the picking button again to cancel. WAV, MP3, OGG, M4A, FLAC, AAC and WebM are accepted when the platform decoder supports them; clips must be at most 3 seconds and 5 MB. The physical key position is used regardless of your typing language.
4. Choose **FunnyBoard only** or **Everywhere**. Everywhere plays sounds in other apps, including while FunnyBoard is minimized. Closing its window in this mode keeps it in the system tray. The tray menu opens, mutes, or quits the app. In FunnyBoard-only mode, closing the window quits.
5. Use the volume slider and sound toggle. **Ctrl/Cmd + Shift + M** toggles sound while FunnyBoard is focused. Explicit preview buttons play a sample even when typing sounds are muted.

To create a continuous profile, open **All profiles → Create profile from audio** and choose one audio file (up to **64 MB**). The name fills in from the filename; you can edit it, and a name you enter yourself is kept when you choose another file. The duration limit is currently **5 minutes**. Longer audio prompts you to use a cropped copy of the beginning; cropping requires your selection and leaves the original file unchanged. Preview it, then select **Create profile**. Loudness is balanced automatically with the built-in profiles while preserving pitch and stereo channels. Each press continues playback; pauses fade out and save the position for the next press.

Notes, volume, the selected profile, and bindings save automatically on your device. Profiles have independent key bindings. **Copy current profile** copies your current setup. **Export current profile** creates a JSON backup including the full uploaded audio; **Import profile** restores it as a new profile and balances its loudness automatically. Existing profile backups remain supported. The download button above the note saves a plain text file.

Profile colors cycle through a palette of 10 in menu order, so any 10 consecutive profiles have different colors. The active profile and its menu card use the same color. Existing profiles, copies, and imports all follow this rule.

## Everywhere mode

- **Windows:** uses the bundled native keyboard listener.
- **macOS:** grant FunnyBoard **System Settings → Privacy & Security → Accessibility** access when prompted, then select Everywhere again.
- **Linux:** requires an **X11** session, `libxtst6`, `libx11-6`, and `libxkbcommon0`. The Debian package declares these dependencies. Wayland cannot expose all application key events through this listener; the app explains this and keeps FunnyBoard-only mode available.

The listener forwards only physical key identifiers and press/release states to the sound engine. It never saves text from other applications. Your note is saved locally because you type it into FunnyBoard's editor. There are no accounts, telemetry, network services, or remote fonts. The listener is stopped when you switch back to FunnyBoard-only mode or quit.

## Develop

Requires Node.js **22.12+** (Node.js 24 recommended) and npm. First install downloads Electron; subsequent app use works offline.

```bash
npm ci
npm start
```

`npm run preview` serves a browser preview at `http://localhost:4173`. It has the same editor, profiles, uploads, and local persistence; Everywhere requires the desktop app.

```bash
npm run check          # JavaScript syntax checks
npm test               # Sound assets, profile validation, key mapping, note counts
npm run test:ui        # Chrome integration tests
npm run test:desktop   # Linux/X11 native integration test in temporary windows
npm run dist:linux     # AppImage and .deb (requires dpkg-deb)
npm run dist:win       # One-click Windows installer; run on Windows
npm run dist:mac       # macOS disk image; run on macOS
```

The UI tests use Google Chrome at `/usr/bin/google-chrome`; set `CHROME_PATH` to another Chrome/Chromium executable as needed. Desktop QA injects two XTest key presses into a temporary test window and needs Python 3 and an X11 session. Set `FUNNYBOARD_EXECUTABLE` to test a packaged app instead of the development build. It uses temporary app data, leaving your notes and profiles alone.

The repository includes a manual/tag-triggered GitHub Actions workflow to build installers on Linux, Windows, and macOS and upload them as workflow artifacts. It does not publish releases.

## Implementation

The UI uses plain HTML, CSS, and JavaScript with no frontend runtime dependencies. Web Audio buffers provide overlapping, low-latency playback. PCM sounds are bundled with the app. Uploaded audio is stored in IndexedDB and loaded when needed; notes and settings use local storage. Continuous profiles use automatic gain adjustment with peak headroom. Accepted crops are saved as stereo/mono PCM WAV copies, at up to 48 kHz, without an external encoder. Profile backups support up to 128 MB, including audio. Electron provides a sandboxed window and a narrow preload bridge; `uiohook-napi` supplies the optional system-wide listener. No keyboard text is passed through the native bridge.

`src/profile-audio.js` contains the duration limit and loudness settings. `PROFILE_LOUDNESS_OFFSET_DB` defaults to `0` and adjusts the target for newly created/imported profiles relative to the five original presets. The baseline uses their median regular-key energy at `PROFILE_REFERENCE_KEYS_PER_SECOND = 6`; `PROFILE_PEAK_LIMIT_DBFS = -3` caps peaks. This is an energy-based reference rather than a fixed LUFS target. Saved gains are not changed retroactively.

Run `python3 scripts/generate-assets.py` to refresh generated assets (Pillow is needed for icons). DM Sans is bundled under the SIL Open Font License in `src/assets/fonts/OFL.txt`. Application source and generated sounds/icons use the MIT license.

"""Generate FunnyBoard's original, deterministic sounds and app icons.

No recordings or third-party audio are used. Run with Python 3; icon generation
also needs Pillow. Generated assets are committed, so users need neither.
"""
from pathlib import Path
import math
import random
import struct
import wave

ROOT = Path(__file__).resolve().parents[1] / 'src' / 'assets'
RATE = 44100


def make_sound(profile, kind):
    duration = {'wood': .17, 'creamy': .13, 'typewriter': .22, 'arcade': .11, 'bubble': .14}[profile]
    if kind == 'enter':
        duration *= 1.55
    rng = random.Random(f'{profile}-{kind}-funnyboard')
    scale = {'key': 1, 'space': .76, 'enter': .86}[kind]
    noise = 0
    samples = []
    for i in range(int(RATE * duration)):
        t = i / RATE
        white = rng.uniform(-1, 1)
        noise = noise * .6 + white * .4
        attack = min(t / .0007, 1)
        if profile == 'wood':
            # Short hammer transient, then inharmonic wooden body resonances.
            value = (noise * .7 * math.exp(-t * 240)
                     + .47 * math.sin(2 * math.pi * 235 * scale * t) * math.exp(-t * 79)
                     + .28 * math.sin(2 * math.pi * 589 * scale * t + .4) * math.exp(-t * 105)
                     + .16 * math.sin(2 * math.pi * 1247 * scale * t) * math.exp(-t * 155))
            # A faint return click, like a switch stem settling.
            if t > .027:
                value += noise * .15 * math.exp(-(t - .027) * 260)
        elif profile == 'creamy':
            value = (noise * .27 * math.exp(-t * 175)
                     + .55 * math.sin(2 * math.pi * 165 * scale * t) * math.exp(-t * 92)
                     + .17 * math.sin(2 * math.pi * 375 * scale * t) * math.exp(-t * 125))
        elif profile == 'typewriter':
            value = (white * .34 * math.exp(-t * 250)
                     + .35 * math.sin(2 * math.pi * 910 * scale * t) * math.exp(-t * 145)
                     + .28 * math.sin(2 * math.pi * 2173 * scale * t) * math.exp(-t * 180)
                     + .18 * math.sin(2 * math.pi * 3511 * scale * t) * math.exp(-t * 100))
            if t > .025:
                value += white * .21 * math.exp(-(t - .025) * 230)
            if kind == 'enter':
                value += .19 * math.sin(2 * math.pi * 2400 * t) * math.exp(-t * 13)
                value += .08 * math.sin(2 * math.pi * 3960 * t) * math.exp(-t * 22)
        elif profile == 'arcade':
            frequency = (620 if kind == 'key' else 420 if kind == 'space' else 930) * (1 + .15 * math.exp(-t * 35))
            phase = 2 * math.pi * frequency * t
            value = .27 * (math.sin(phase) + .25 * math.sin(phase * 3)) * math.exp(-t * 55)
        else:
            phase = 2 * math.pi * scale * (280 * t + 17 * (1 - math.exp(-t * 75)))
            value = (.55 * math.sin(phase) * math.exp(-t * 60)
                     + noise * .15 * math.exp(-t * 280))
        fade = min(1, (duration - t) / .008)
        samples.append(value * attack * fade)
    # Normalize to -7 dBFS for headroom when several keys overlap.
    peak = max(abs(n) for n in samples) or 1
    return [int(n / peak * .44 * 32767) for n in samples]


def sounds():
    folder = ROOT / 'sounds'
    folder.mkdir(parents=True, exist_ok=True)
    for profile in ['wood', 'creamy', 'typewriter', 'arcade', 'bubble']:
        for kind in ['key', 'space', 'enter']:
            values = make_sound(profile, kind)
            with wave.open(str(folder / f'{profile}-{kind}.wav'), 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(RATE)
                output.writeframes(struct.pack(f'<{len(values)}h', *values))


def icons():
    from PIL import Image, ImageDraw
    factor = 3
    image = Image.new('RGBA', (512 * factor, 512 * factor))
    draw = ImageDraw.Draw(image)
    def box(coords, radius, color):
        draw.rounded_rectangle(tuple(n * factor for n in coords), radius * factor, fill=color)
    box((0, 0, 512, 512), 120, '#e7754c')
    box((91, 104, 421, 428), 68, '#a54c32')
    box((91, 83, 421, 396), 68, '#fff6e9')
    draw.polygon([(x * factor, y * factor) for x, y in [(204, 168), (334, 168), (334, 205), (248, 205), (248, 247), (321, 247), (321, 284), (248, 284), (248, 349), (204, 349)]], fill='#493a32')
    resampling = getattr(Image, 'Resampling', Image)
    image = image.resize((512, 512), resampling.LANCZOS)
    image.save(ROOT / 'icon.png')
    image.resize((32, 32), resampling.LANCZOS).save(ROOT / 'tray.png')


if __name__ == '__main__':
    sounds()
    icons()
    print('Generated 15 original sounds, app icon, and tray icon.')

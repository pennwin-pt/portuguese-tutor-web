"""生成 M6 的变形效果音（程序合成，22.05 kHz / 单声道 / 16 bit，每个 < 40 KB）。
用法：python gen_fx_sounds.py [输出目录，默认 本脚本旁边的 roam/]
想换成自己的音效：直接用同名 .wav 覆盖即可（缺文件时前端静默不播，不会报错）。"""
import sys, wave
from pathlib import Path
import numpy as np

SR = 22050
rng = np.random.default_rng(7)

def t_(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.01, r=0.1):
    e = np.ones(n); na, nr = max(1, int(SR * a)), max(1, int(SR * r))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def glide(f0, f1, d, vib=0.0):
    t = t_(d); f = np.linspace(f0, f1, len(t)) * (1 + vib * np.sin(2 * np.pi * 7 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def lowpass(x, k):
    out = np.copy(x)
    for i in range(1, len(x)): out[i] = out[i - 1] + k * (x[i] - out[i - 1])
    return out
def noise(d): return rng.uniform(-1, 1, int(SR * d))
def ping(f, d=0.18):
    t = t_(d); return np.sin(2 * np.pi * f * t) * np.exp(-t * 18)
def place(parts, total):
    out = np.zeros(int(SR * total))
    for start, x in parts:
        i = int(SR * start); out[i:i + len(x)] += x[:max(0, len(out) - i)]
    return out

def fx_grow(): return glide(220, 660, 0.45, 0.01) * env(int(SR * 0.45), 0.02, 0.15)
def fx_shrink(): return glide(660, 240, 0.4, 0.01) * env(int(SR * 0.4), 0.01, 0.15)
def fx_tint():
    t = t_(0.5); x = (np.sin(2 * np.pi * 523 * t) + 0.8 * np.sin(2 * np.pi * 784 * t * 1.003) + 0.5 * np.sin(2 * np.pi * 1046 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t))
    return x * env(len(t), 0.04, 0.25)
def fx_sparkle(): return place([(0, ping(1318)), (0.09, ping(1760)), (0.18, ping(2093, 0.25))], 0.5)
def fx_aura():
    n = lowpass(noise(0.55), 0.18); t = t_(0.55); return n * np.sin(np.pi * t / 0.55) ** 1.5 * 2.2
def fx_dirt():
    n = lowpass(noise(0.3), 0.35) * np.exp(-t_(0.3) * 12); thud = np.sin(2 * np.pi * 120 * t_(0.3)) * np.exp(-t_(0.3) * 14); return n * 2.5 + thud
def fx_old():
    t = t_(0.55); saw = 2 * ((t * np.linspace(140, 105, len(t))) % 1) - 1; return lowpass(saw, 0.12) * (0.55 + 0.45 * np.sin(2 * np.pi * 11 * t)) * env(len(t), 0.05, 0.2) * 2.2
def fx_light(): return place([(0, glide(560, 900, 0.14) * env(int(SR * 0.14), 0.01, 0.08)), (0.16, glide(620, 1000, 0.16) * env(int(SR * 0.16), 0.01, 0.1))], 0.36)
def fx_heavy():
    t = t_(0.4); thud = glide(95, 48, 0.4) * np.exp(-t * 7); puff = lowpass(noise(0.4), 0.15) * np.exp(-t * 9); return thud * 1.3 + puff * 1.5
def fx_pop(): return glide(380, 950, 0.13) * env(int(SR * 0.13), 0.004, 0.08)
def fx_zip():
    t = t_(0.28); n = lowpass(noise(0.28), 0.4) * np.sin(np.pi * t / 0.28) * 1.6; return n + 0.5 * glide(400, 1700, 0.28) * env(len(t), 0.02, 0.1)
def fx_slow():
    t = t_(0.6); return np.sin(2 * np.pi * np.cumsum(np.linspace(320, 190, len(t)) * (1 + 0.04 * np.sin(2 * np.pi * 4 * t))) / SR) * env(len(t), 0.06, 0.3)
def fx_cash(): return place([(0, ping(1568, 0.22)), (0.11, ping(2093, 0.35) * 1.1)], 0.5) + place([(0, noise(0.03) * 0.5)], 0.5)
def fx_revert(): return glide(720, 300, 0.25) * env(int(SR * 0.25), 0.01, 0.12) * 0.8
def machine():
    parts = [(0.05 * i, noise(0.02) * np.exp(-t_(0.02) * 120) * 1.4) for i in range(6)]
    hum = np.sin(2 * np.pi * 100 * t_(0.4)) * env(int(SR * 0.4), 0.05, 0.12) * 0.5
    return place(parts, 0.4) + hum

NAMES = ['fx_grow', 'fx_shrink', 'fx_tint', 'fx_sparkle', 'fx_aura', 'fx_dirt', 'fx_old', 'fx_light', 'fx_heavy', 'fx_pop', 'fx_zip', 'fx_slow', 'fx_cash', 'fx_revert', 'machine']

def write(path, x, peak=0.55):
    x = x / (np.max(np.abs(x)) or 1) * peak
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'roam'; out.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        write(out / f'{name}.wav', globals()[name]())
    print(f'已生成 {len(NAMES)} 个音效到 {out}')

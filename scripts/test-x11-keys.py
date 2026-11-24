"""Send two XTest key presses. Called only with our own QA window focused."""
import ctypes
import time
from ctypes.util import find_library
x11 = ctypes.CDLL(find_library('X11'))
xtst = ctypes.CDLL(find_library('Xtst'))
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
if not display:
    raise RuntimeError('An X11 display is required for desktop QA.')
try:
    for keysym in [ord('a'), ord(' ')]:
        code = x11.XKeysymToKeycode(display, keysym)
        xtst.XTestFakeKeyEvent(display, code, 1, 0)
        x11.XFlush(display)
        time.sleep(.06)
        xtst.XTestFakeKeyEvent(display, code, 0, 0)
        x11.XFlush(display)
        time.sleep(.1)
finally:
    x11.XCloseDisplay(display)

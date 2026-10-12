"""Credentials encrypted for the current Windows user using DPAPI."""
import base64
import ctypes
from ctypes import wintypes
import json
import os

class Blob(ctypes.Structure):
    _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]

def crypt(value,decrypt=False):
    if os.name!='nt':raise ValueError('이 설정 저장은 Windows에서 지원합니다.')
    buffer=ctypes.create_string_buffer(value)
    source=Blob(len(value),ctypes.cast(buffer,ctypes.POINTER(ctypes.c_ubyte)))
    output=Blob()
    function=ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not function(ctypes.byref(source),None,None,None,None,1,ctypes.byref(output)):raise ValueError('암호화된 설정을 읽거나 저장하지 못했습니다.')
    try:return ctypes.string_at(output.data,output.size)
    finally:
        free=ctypes.windll.kernel32.LocalFree
        free.argtypes=[ctypes.c_void_p]
        free.restype=ctypes.c_void_p
        free(ctypes.cast(output.data,ctypes.c_void_p))

def load(root):
    path=root/'credentials.dpapi'
    if not path.is_file():return {}
    return json.loads(crypt(base64.b64decode(path.read_bytes()),True))

def save(root,values):
    encoded=base64.b64encode(crypt(json.dumps(values).encode()))
    temporary=root/'credentials.dpapi.tmp'
    temporary.write_bytes(encoded)
    temporary.replace(root/'credentials.dpapi')

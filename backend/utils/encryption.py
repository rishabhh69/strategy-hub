"""
Fernet (AES-128-CBC + HMAC) encryption for broker secrets at rest.
Reads base64 Fernet key from ENCRYPTION_KEY env var. Never log or return plain-text secrets.
"""

import os

from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    key_b64 = (os.getenv("ENCRYPTION_KEY") or "").strip()
    if not key_b64:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Generate a key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and set it in backend/.env"
        )
    try:
        return Fernet(key_b64.encode() if isinstance(key_b64, str) else key_b64)
    except Exception as e:
        raise RuntimeError(f"ENCRYPTION_KEY is invalid (must be base64 Fernet key): {e}") from e


def encrypt_secret(plain_text: str) -> str:
    """Encrypt a plain-text secret (e.g. PIN, TOTP). Returns base64 ciphertext."""
    if not plain_text:
        return ""
    fernet = _get_fernet()
    cipher = fernet.encrypt(plain_text.encode("utf-8"))
    return cipher.decode("ascii")


def decrypt_secret(cipher_text: str) -> str:
    """Decrypt a ciphertext produced by encrypt_secret. Returns plain text."""
    if not cipher_text:
        return ""
    fernet = _get_fernet()
    try:
        return fernet.decrypt(cipher_text.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Decryption failed (invalid or corrupted ciphertext or wrong key)")

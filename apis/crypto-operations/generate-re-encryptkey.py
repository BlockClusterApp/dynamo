import base64
import sys
from umbral import pre, keys
from umbral.signing import Signer

alice_private_key = keys.UmbralPrivateKey.from_bytes(base64.b64decode(sys.argv[1]))
signer_alice = Signer(alice_private_key)
bob_public_key = keys.UmbralPublicKey.from_bytes(base64.b64decode(sys.argv[2]))
kfrags = pre.split_rekey(alice_private_key, signer_alice, bob_public_key, 10, 20)

kfrags_bytes = tuple(map(bytes, kfrags))
L = list(kfrags_bytes)
for idx, row in enumerate(L):
    L[idx] = base64.b64encode(row).decode("utf-8")


print(",".join(L))

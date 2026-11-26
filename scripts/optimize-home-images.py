from pathlib import Path
from PIL import Image, ImageOps

# Preserve original artwork. Generate smaller derivatives for homepage only.
targets = [
 ("art/golden-retriever-mountain-garden.webp", 800),
 ("art/royal-golden-retriever.webp", 720),
 ("art/black-cat-on-blue-blanket.webp", 720),
 ("assets/08-two-pomeranians.jpg", 720),
 ("assets/atelier-hau-header-logo.png", 540),
]
for name, width in targets:
    src = Path(name)
    dst = src.with_name(src.stem + "-home-" + str(width) + ".webp")
    with Image.open(src) as raw:
        im = ImageOps.exif_transpose(raw)
        im.thumbnail((width, 1800), Image.Resampling.LANCZOS)
        im.save(dst, "WEBP", quality=85, method=6, icc_profile=raw.info.get("icc_profile", b""))
    print(f"{src}: {src.stat().st_size} -> {dst.stat().st_size} bytes")
    if dst.stat().st_size >= src.stat().st_size:
        raise RuntimeError(f"No saving: {dst}")

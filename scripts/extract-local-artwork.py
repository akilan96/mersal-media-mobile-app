"""Extract original decorative artwork from the supplied Stitch PNG references.

Requires Pillow: run with a Python environment containing PIL.
No generation, recoloring, background removal, resizing, or UI rasterization occurs.
The complete source screens remain in design-reference; only illustration/logo
regions are copied into runtime assets. Crop coordinates are Pillow's half-open
(left, top, right, bottom) pixel bounds in the original 900 x 1600 images.

Run from any directory:
    python scripts/extract-local-artwork.py
An optional --reference-root can point to an extracted design export elsewhere.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REFERENCE_ROOT = (
    PROJECT_ROOT / "design-reference" / "stitch_mersal_media_app_redesign"
)
OUTPUT_ROOT = PROJECT_ROOT / "assets" / "design"

CROPS = (
    {
        "file": "welcome-hero.png",
        "screen": "welcome_splash",
        "source": "chatgpt_image_nov_18_2026_11_53_04_pm_2.png/screen.png",
        "bounds": (0, 280, 900, 975),
        "purpose": "Camera, plant, clapperboard, and printed photographs only",
    },
    {
        "file": "login-hero.png",
        "screen": "login",
        "source": "chatgpt_image_nov_18_2026_11_53_05_pm_3.png/screen.png",
        "bounds": (0, 50, 900, 410),
        "purpose": "Camera and prints above the separate native brand and login form",
    },
    {
        "file": "photos-hero.png",
        "screen": "photos_coming_soon",
        "source": "chatgpt_image_nov_18_2026_11_53_11_pm_9.png/screen.png",
        "bounds": (0, 70, 900, 575),
        "purpose": "Camera and photographs above the native Coming Soon content",
    },
    {
        "file": "dashboard-camera.png",
        "screen": "home_dashboard",
        "source": "chatgpt_image_nov_18_2026_11_53_04_pm_1.png/screen.png",
        "bounds": (470, 155, 900, 430),
        "purpose": "Right-aligned camera vignette, excluding greeting and notification UI",
    },
    {
        "file": "brand-logo.png",
        "screen": "welcome_splash",
        "source": "chatgpt_image_nov_18_2026_11_53_04_pm_2.png/screen.png",
        "bounds": (50, 130, 172, 248),
        "purpose": "Original camera logo tile, excluding brand text",
    },
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-root", type=Path, default=DEFAULT_REFERENCE_ROOT)
    args = parser.parse_args()
    reference_root = args.reference_root.resolve()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    # Preserve the original HTML URL retrieval records before replacing that
    # manifest with the exact provenance of the extracted runtime artwork.
    manifest_path = OUTPUT_ROOT / "manifest.json"
    remote_manifest_path = OUTPUT_ROOT / "remote-source-manifest.json"
    if manifest_path.exists() and not remote_manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        if isinstance(existing, list) and any("source" in row for row in existing):
            remote_manifest_path.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    artifacts = []
    for specification in CROPS:
        source_path = reference_root / specification["source"]
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing supplied screen reference: {source_path}")
        bounds = specification["bounds"]
        with Image.open(source_path) as source_image:
            if source_image.size != (900, 1600):
                raise ValueError(
                    f"Unexpected reference dimensions {source_image.size}: {source_path}"
                )
            if not (0 <= bounds[0] < bounds[2] <= source_image.width
                    and 0 <= bounds[1] < bounds[3] <= source_image.height):
                raise ValueError(f"Crop is outside its reference: {specification['file']}")
            crop = source_image.crop(bounds)
            output_path = OUTPUT_ROOT / specification["file"]
            crop.save(output_path, format="PNG", optimize=True)

        artifacts.append({
            "file": specification["file"],
            "screen": specification["screen"],
            "sourceReference": specification["source"],
            "sourceDimensions": [900, 1600],
            "cropBounds": list(bounds),
            "cropBoundsConvention": "left, top, right-exclusive, bottom-exclusive",
            "outputDimensions": [bounds[2] - bounds[0], bounds[3] - bounds[1]],
            "purpose": specification["purpose"],
            "sourceSha256": sha256_file(source_path),
            "outputSha256": sha256_file(output_path),
            "bytes": output_path.stat().st_size,
        })
        print(f"Extracted {specification['file']}: {crop.width} x {crop.height}")

    manifest = {
        "schemaVersion": 1,
        "method": "Lossless rectangular crops of the user's original supplied PNG references",
        "excluded": "OS status bars, headings, text inputs, buttons, cards, and bottom navigation",
        "note": "Original HTML image URLs resolve to complete lower-resolution screen compositions; see remote-source-manifest.json. They are not used as native screen implementations.",
        "artifacts": artifacts,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()

use wasm_bindgen::prelude::*;
use bytes::Bytes;
use img_parts::{jpeg::Jpeg, png::Png, ImageEXIF};
use std::io::Cursor;
use image;

mod video;
mod watermark;

#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    Ok(())
}

#[wasm_bindgen]
pub struct StripResult {
    data: Vec<u8>,
    modified: bool,
}

#[wasm_bindgen]
impl StripResult {
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn modified(&self) -> bool {
        self.modified
    }
}

#[wasm_bindgen]
pub fn strip_image_metadata(input: &[u8], ext: &str) -> StripResult {
    let ext_lower = ext.to_lowercase();
    let mut modified = false;
    let mut output_data = input.to_vec();

    if ext_lower == "jpg" || ext_lower == "jpeg" {
        if let Ok(mut jpeg) = Jpeg::from_bytes(Bytes::from(input.to_vec())) {
            let initial_exif = jpeg.exif().is_some();
            if initial_exif {
                jpeg.set_exif(None);
            }

            let initial_len = jpeg.segments().len();
            jpeg.segments_mut().retain(|s| {
                let marker = s.marker();
                if marker >= 0xE0 && marker <= 0xEF {
                    if marker == 0xE0 {
                        true
                    } else {
                        false
                    }
                } else {
                    true
                }
            });

            if initial_exif || jpeg.segments().len() != initial_len {
                let mut out = Vec::new();
                if jpeg.encoder().write_to(&mut out).is_ok() {
                    output_data = out;
                    modified = true;
                }
            }
        }
    } else if ext_lower == "png" {
        if let Ok(mut png) = Png::from_bytes(Bytes::from(input.to_vec())) {
            let initial_exif = png.exif().is_some();
            if initial_exif {
                png.set_exif(None);
            }

            let initial_len = png.chunks().len();
            png.chunks_mut().retain(|chunk| {
                let kind = chunk.kind();
                let is_ancillary = (kind[0] & 0x20) != 0;

                if is_ancillary {
                    matches!(&kind, b"tRNS" | b"cHRM" | b"gAMA" | b"sBIT" | b"sRGB" | b"bKGD" | b"pHYs")
                } else {
                    true
                }
            });

            if initial_exif || png.chunks().len() != initial_len {
                let mut out = Vec::new();
                if png.encoder().write_to(&mut out).is_ok() {
                    output_data = out;
                    modified = true;
                }
            }
        }
    } else {
        if let Ok(img) = image::load_from_memory(input) {
            let mut out = Cursor::new(Vec::new());
            let format = match ext_lower.as_str() {
                "webp" => image::ImageFormat::WebP,
                "gif" => image::ImageFormat::Gif,
                "bmp" => image::ImageFormat::Bmp,
                "tiff" | "tif" => image::ImageFormat::Tiff,
                "ico" => image::ImageFormat::Ico,
                "tga" => image::ImageFormat::Tga,
                "qoi" => image::ImageFormat::Qoi,
                "avif" => image::ImageFormat::Avif,
                _ => image::ImageFormat::Png,
            };

            if img.write_to(&mut out, format).is_ok() {
                output_data = out.into_inner();
                modified = true;
            }
        }
    }

    StripResult {
        data: output_data,
        modified,
    }
}

#[wasm_bindgen]
pub fn strip_video_metadata(input: &[u8], ext: &str) -> StripResult {
    match video::strip_metadata(input, ext) {
        Some(data) => StripResult {
            data,
            modified: true,
        },
        None => StripResult {
            data: input.to_vec(),
            modified: false,
        },
    }
}

#[wasm_bindgen]
pub fn remove_watermark(
    input: &[u8],
    ext: &str,
    method: &str,
    threshold: u32,
    window: u32,
    radius: u32,
) -> StripResult {
    let data = watermark::remove_watermark(input, ext, method, threshold, window, radius);
    let modified = data.len() != input.len() || data != input;
    StripResult { data, modified }
}

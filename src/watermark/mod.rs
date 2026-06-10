pub mod spatial;
pub mod fft;

use image::ImageFormat;
use std::io::Cursor;

pub fn remove_watermark(
    input: &[u8],
    ext: &str,
    method: &str,
    threshold: u32,
    window: u32,
    radius: u32,
) -> Vec<u8> {
    let ext_lower = ext.to_lowercase();
    let format = match ext_lower.as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "gif" => ImageFormat::Gif,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "ico" => ImageFormat::Ico,
        "tga" => ImageFormat::Tga,
        "qoi" => ImageFormat::Qoi,
        "avif" => ImageFormat::Avif,
        _ => return input.to_vec(),
    };

    let mut img = match image::load_from_memory(input) {
        Ok(i) => i,
        Err(_) => return input.to_vec(),
    };

    match method {
        "fft" => fft::remove_watermark(&mut img, threshold, window, radius),
        _ => spatial::remove_watermark(&mut img, threshold, window, radius),
    }

    let mut out = Cursor::new(Vec::new());
    let output_format = if format == ImageFormat::Jpeg || format == ImageFormat::Png {
        format
    } else {
        ImageFormat::Png
    };

    if img.write_to(&mut out, output_format).is_ok() {
        out.into_inner()
    } else {
        input.to_vec()
    }
}

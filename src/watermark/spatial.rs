use image::{DynamicImage, Rgba};
use std::cmp::{max, min};

fn compute_local_mean(img: &[u8], x: u32, y: u32, w: u32, h: u32, window: u32) -> u32 {
    let half = window / 2;
    let mut sum = 0u64;
    let mut count = 0u64;
    let sy = if y < half { 0 } else { y - half };
    let ey = min(y + half, h - 1);
    let sx = if x < half { 0 } else { x - half };
    let ex = min(x + half, w - 1);
    let stride = 4usize;

    for iy in sy..=ey {
        for ix in sx..=ex {
            let idx = ((iy * w + ix) as usize) * stride;
            let luma = (img[idx] as u32 * 299 + img[idx + 1] as u32 * 587 + img[idx + 2] as u32 * 114) / 1000;
            sum += luma as u64;
            count += 1;
        }
    }
    if count == 0 { 0 } else { (sum / count) as u32 }
}

fn interpolate_pixel(img: &[u8], mask: &[bool], x: u32, y: u32, w: u32, h: u32, radius: u32) -> Rgba<u8> {
    let stride = 4usize;
    let mut r_sum = 0u64;
    let mut g_sum = 0u64;
    let mut b_sum = 0u64;
    let mut total_weight = 0u64;

    let r = radius as i32;
    for dy in -r..=r {
        for dx in -r..=r {
            if dx == 0 && dy == 0 { continue; }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { continue; }
            let idx = (ny as u32 * w + nx as u32) as usize;
            if mask[idx] { continue; }
            let dist = (dx.abs() + dy.abs()) as u64;
            if dist == 0 { continue; }
            let weight = (radius as u64 * 2).saturating_sub(dist);
            let px = &img[idx * stride..(idx + 1) * stride];
            r_sum += px[0] as u64 * weight;
            g_sum += px[1] as u64 * weight;
            b_sum += px[2] as u64 * weight;
            total_weight += weight;
        }
    }

    if total_weight == 0 {
        Rgba([img[((y * w + x) as usize) * stride], 0, 0, 255])
    } else {
        Rgba([
            (r_sum / total_weight) as u8,
            (g_sum / total_weight) as u8,
            (b_sum / total_weight) as u8,
            255,
        ])
    }
}

fn morph_close(mask: &mut Vec<bool>, w: u32, h: u32) {
    let mut dilated = mask.clone();
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            if mask[(y * w + x) as usize] {
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let ny = (y as i32 + dy) as u32;
                        let nx = (x as i32 + dx) as u32;
                        dilated[(ny * w + nx) as usize] = true;
                    }
                }
            }
        }
    }
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let mut all = true;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let ny = (y as i32 + dy) as u32;
                    let nx = (x as i32 + dx) as u32;
                    if !dilated[(ny * w + nx) as usize] {
                        all = false;
                    }
                }
            }
            mask[(y * w + x) as usize] = all;
        }
    }
}

pub fn remove_watermark(img: &mut DynamicImage, threshold: u32, window: u32, radius: u32) {
    let rgb = img.to_rgba8();
    let (w, h) = rgb.dimensions();
    let stride = 4usize;
    let pixels = rgb.into_raw();
    let mut output = pixels.clone();
    let pixel_count = (w * h) as usize;
    let mut mask = vec![false; pixel_count];
    let thresh = max(threshold, 10);

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            let luma = (pixels[idx * stride] as u32 * 299
                + pixels[idx * stride + 1] as u32 * 587
                + pixels[idx * stride + 2] as u32 * 114)
                / 1000;
            let local = compute_local_mean(&pixels, x, y, w, h, window);
            if luma > local + thresh {
                mask[idx] = true;
            }
        }
    }

    morph_close(&mut mask, w, h);

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if mask[idx] {
                let p = interpolate_pixel(&output, &mask, x, y, w, h, radius);
                output[idx * stride] = p[0];
                output[idx * stride + 1] = p[1];
                output[idx * stride + 2] = p[2];
                output[idx * stride + 3] = 255;
            }
        }
    }

    *img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(w, h, output).unwrap()
    );
}

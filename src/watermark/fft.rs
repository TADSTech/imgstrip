use image::DynamicImage;

fn next_pow2(n: usize) -> usize {
    let mut p = 1;
    while p < n {
        p <<= 1;
    }
    p
}

fn bit_reverse(x: usize, log2: usize) -> usize {
    let mut rev = 0usize;
    for i in 0..log2 {
        if x & (1 << i) != 0 {
            rev |= 1 << (log2 - 1 - i);
        }
    }
    rev
}

fn fft_1d_real(data: &mut [f64]) {
    let n = data.len();
    if n <= 2 { return; }
    let log2 = (n as f64).log2().round() as usize;

    let mut re = data.to_vec();
    let mut im = vec![0.0f64; n];

    for i in 0..n {
        let j = bit_reverse(i, log2);
        if j > i {
            re.swap(i, j);
        }
    }

    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let angle = -2.0 * std::f64::consts::PI / len as f64;
        let w_re = angle.cos();
        let w_im = angle.sin();

        for i in (0..n).step_by(len) {
            let mut cur_re = 1.0f64;
            let mut cur_im = 0.0f64;
            for j in 0..half {
                let u_re = re[i + j];
                let u_im = im[i + j];
                let v_re = cur_re * re[i + j + half] - cur_im * im[i + j + half];
                let v_im = cur_re * im[i + j + half] + cur_im * re[i + j + half];
                re[i + j] = u_re + v_re;
                im[i + j] = u_im + v_im;
                re[i + j + half] = u_re - v_re;
                im[i + j + half] = u_im - v_im;

                let new_re = cur_re * w_re - cur_im * w_im;
                let new_im = cur_re * w_im + cur_im * w_re;
                cur_re = new_re;
                cur_im = new_im;
            }
        }
        len <<= 1;
    }

    for i in 0..n {
        data[i] = re[i];
    }
}

fn ifft_1d_real(data: &mut [f64]) {
    let n = data.len();
    let log2 = (n as f64).log2().round() as usize;

    let mut re = data.to_vec();
    let mut im = vec![0.0f64; n];

    for i in 0..n {
        let j = bit_reverse(i, log2);
        if j > i {
            re.swap(i, j);
        }
    }

    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let angle = 2.0 * std::f64::consts::PI / len as f64;
        let w_re = angle.cos();
        let w_im = angle.sin();

        for i in (0..n).step_by(len) {
            let mut cur_re = 1.0f64;
            let mut cur_im = 0.0f64;
            for j in 0..half {
                let u_re = re[i + j];
                let u_im = im[i + j];
                let v_re = cur_re * re[i + j + half] - cur_im * im[i + j + half];
                let v_im = cur_re * im[i + j + half] + cur_im * re[i + j + half];
                re[i + j] = u_re + v_re;
                im[i + j] = u_im + v_im;
                re[i + j + half] = u_re - v_re;
                im[i + j + half] = u_im - v_im;

                let new_re = cur_re * w_re - cur_im * w_im;
                let new_im = cur_re * w_im + cur_im * w_re;
                cur_re = new_re;
                cur_im = new_im;
            }
        }
        len <<= 1;
    }

    let inv_n = 1.0 / n as f64;
    for i in 0..n {
        data[i] = re[i] * inv_n;
    }
}

fn apply_2d_fft(buf: &mut [f64], w: usize, h: usize) {
    for y in 0..h {
        fft_1d_real(&mut buf[y * w..(y + 1) * w]);
    }
    let mut col = vec![0.0f64; h];
    for x in 0..w {
        for y in 0..h {
            col[y] = buf[y * w + x];
        }
        fft_1d_real(&mut col);
        for y in 0..h {
            buf[y * w + x] = col[y];
        }
    }
}

fn apply_2d_ifft(buf: &mut [f64], w: usize, h: usize) {
    let mut col = vec![0.0f64; h];
    for x in 0..w {
        for y in 0..h {
            col[y] = buf[y * w + x];
        }
        ifft_1d_real(&mut col);
        for y in 0..h {
            buf[y * w + x] = col[y];
        }
    }
    for y in 0..h {
        ifft_1d_real(&mut buf[y * w..(y + 1) * w]);
    }
}

fn notch_filter(buf: &mut [f64], w: usize, h: usize, radius: u32) {
    let cx = w / 2;
    let cy = h / 2;
    let r = radius as usize;
    let r2 = r * r;

    for y in 0..h {
        for x in 0..w {
            let dx = (x as i32 - cx as i32).unsigned_abs() as usize;
            let dy = (y as i32 - cy as i32).unsigned_abs() as usize;
            if dx < 5 || dy < 5 {
                continue;
            }
            let d2 = dx * dx + dy * dy;
            if d2 < r2 {
                buf[y * w + x] = 0.0;
            }
        }
    }
}

pub fn remove_watermark(img: &mut DynamicImage, _threshold: u32, _window: u32, radius: u32) {
    let rgb = img.to_rgba8();
    let (w, h) = rgb.dimensions();
    let pw = next_pow2(w as usize);
    let ph = next_pow2(h as usize);
    let pixels = rgb.into_raw();

    let mut channels = [vec![0.0f64; pw * ph], vec![0.0f64; pw * ph], vec![0.0f64; pw * ph]];
    let stride = 4usize;

    for y in 0..(h as usize) {
        for x in 0..(w as usize) {
            let src = (y * w as usize + x) * stride;
            let dst = y * pw + x;
            channels[0][dst] = pixels[src] as f64;
            channels[1][dst] = pixels[src + 1] as f64;
            channels[2][dst] = pixels[src + 2] as f64;
        }
    }

    for ch in &mut channels {
        apply_2d_fft(ch, pw, ph);
        notch_filter(ch, pw, ph, radius);
        apply_2d_ifft(ch, pw, ph);
    }

    let mut output = vec![0u8; (w * h) as usize * 4];
    for y in 0..(h as usize) {
        for x in 0..(w as usize) {
            let dst = (y * w as usize + x) * stride;
            let src = y * pw + x;
            output[dst] = channels[0][src].clamp(0.0, 255.0) as u8;
            output[dst + 1] = channels[1][src].clamp(0.0, 255.0) as u8;
            output[dst + 2] = channels[2][src].clamp(0.0, 255.0) as u8;
            output[dst + 3] = 255;
        }
    }

    *img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(w, h, output).unwrap()
    );
}

use crate::utils::dynamic_image_to_mat;
use image::{DynamicImage, GenericImageView, RgbImage};
use opencv::core::Mat;
use opencv::imgcodecs::IMREAD_GRAYSCALE;
use opencv::imgproc::{threshold, THRESH_OTSU};

pub fn lighten(image1: &DynamicImage, image2: &DynamicImage) -> DynamicImage {
    let (width, height) = image1.dimensions();
    let mut image = RgbImage::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let pixel1 = image1.get_pixel(x, y);
            let pixel2 = image2.get_pixel(x, y);

            let r1 = pixel1[0] as f32;
            let g1 = pixel1[1] as f32;
            let b1 = pixel1[2] as f32;

            let r2 = pixel2[0] as f32;
            let g2 = pixel2[1] as f32;
            let b2 = pixel2[2] as f32;

            let l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
            let l2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;

            if l1 > l2 {
                image.put_pixel(x, y, image::Rgb([r1 as u8, g1 as u8, b1 as u8]));
            } else {
                image.put_pixel(x, y, image::Rgb([r2 as u8, g2 as u8, b2 as u8]));
            }
        }
    }

    DynamicImage::from(image)
}

pub fn average(image1: &DynamicImage, image2: &DynamicImage) -> DynamicImage {
    average_images(&[image1.clone(), image2.clone()]).expect("images must have matching dimensions")
}

pub fn average_images(images: &[DynamicImage]) -> Result<DynamicImage, String> {
    if images.is_empty() {
        return Err("at least one image is required".to_string());
    }

    let (width, height) = images[0].dimensions();
    for image in images {
        if image.dimensions() != (width, height) {
            return Err("all images must have the same dimensions".to_string());
        }
    }

    let mut output = RgbImage::new(width, height);
    let divisor = images.len() as u64;

    for y in 0..height {
        for x in 0..width {
            let mut r = 0_u64;
            let mut g = 0_u64;
            let mut b = 0_u64;

            for image in images {
                let pixel = image.get_pixel(x, y);
                r += pixel[0] as u64;
                g += pixel[1] as u64;
                b += pixel[2] as u64;
            }

            output.put_pixel(
                x,
                y,
                image::Rgb([
                    (r / divisor) as u8,
                    (g / divisor) as u8,
                    (b / divisor) as u8,
                ]),
            );
        }
    }

    Ok(DynamicImage::from(output))
}

pub fn binarize(image: &DynamicImage) -> DynamicImage {
    let mat = dynamic_image_to_mat(image, IMREAD_GRAYSCALE);

    let max_thresh_val =
        threshold(&mat, &mut Mat::default(), 0.0, 255.0, THRESH_OTSU).unwrap() as f32;

    let (width, height) = image.dimensions();
    let mut new_image = RgbImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let pixel = image.get_pixel(x, y);
            let r = pixel[0] as f32;
            let g = pixel[1] as f32;
            let b = pixel[2] as f32;
            let l = 0.299 * r + 0.587 * g + 0.114 * b;
            if l > max_thresh_val {
                new_image.put_pixel(x, y, image::Rgb([255, 255, 255]));
            } else {
                new_image.put_pixel(x, y, image::Rgb([0, 0, 0]));
            }
        }
    }
    DynamicImage::from(new_image)
}

use image::DynamicImage;
use opencv::core::{DMatch, KeyPoint, Mat, Scalar, Vector};
use opencv::features2d::draw_matches;
use opencv::features2d::DrawMatchesFlags::NOT_DRAW_SINGLE_POINTS;
use opencv::imgcodecs::{imdecode, imencode};
use rawler::imgop::develop::RawDevelop;
use std::io::Cursor;
use std::path::Path;

pub fn draw_match_points(
    k1: &Vector<KeyPoint>,
    k2: &Vector<KeyPoint>,
    matches: &Vector<DMatch>,
    mat1: &Mat,
    mat2: &Mat,
    output_path: &str,
) -> Result<(), image::ImageError> {
    let mut output = Mat::default();
    draw_matches(
        mat1,
        k1,
        mat2,
        k2,
        matches,
        &mut output,
        Scalar::all(-1_f64),
        Scalar::all(-1_f64),
        &Vector::new(),
        NOT_DRAW_SINGLE_POINTS,
    )
    .expect("OpenCV draw_matches failed");

    mat_to_dynamic_image(&output).save(output_path)
}

pub fn dynamic_image_to_mat(image: &DynamicImage, flags: i32) -> Mat {
    let mut bytes: Vec<u8> = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), image::ImageOutputFormat::Tiff)
        .expect("failed to encode image for OpenCV");
    imdecode(bytes.as_slice(), flags).expect("failed to decode image with OpenCV")
}

pub fn mat_to_dynamic_image(mat: &Mat) -> DynamicImage {
    let mut buf = Vector::new();
    imencode(".tiff", mat, &mut buf, &Vector::new()).expect("failed to encode OpenCV mat");
    image::load_from_memory(buf.as_slice()).expect("failed to load image from OpenCV buffer")
}

pub fn convert_to_dynamic_image(file_path: &str) -> Result<DynamicImage, String> {
    let extension = Path::new(file_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "cr3" => {
            let raw_image = rawler::decode_file(file_path).map_err(|error| error.to_string())?;
            let dev = RawDevelop::default();
            dev.develop_intermediate(&raw_image)
                .map_err(|error| error.to_string())?
                .to_dynamic_image()
                .map_err(|error| error.to_string())
        }
        "jpg" | "jpeg" | "png" | "webp" | "avif" | "tif" | "tiff" => {
            image::open(file_path).map_err(|error| error.to_string())
        }
        _ => Err(format!("unsupported file type: {extension}")),
    }
}

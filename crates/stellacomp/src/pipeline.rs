use crate::calc::matches;
use crate::imageproc::average_images;
use crate::utils::{convert_to_dynamic_image, dynamic_image_to_mat, mat_to_dynamic_image};
use image::{DynamicImage, GenericImageView};
use opencv::calib3d::{estimate_affine_partial_2d, RANSAC};
use opencv::core::{
    count_non_zero, KeyPointTraitConst, Mat, MatTraitConst, Point2f, Scalar, Vector,
};
use opencv::imgcodecs::IMREAD_COLOR;
use opencv::imgproc::warp_affine;
use std::fmt;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct AlignAndAverageInput {
    pub images: Vec<InputImage>,
    pub output_path: String,
    pub base_image_index: usize,
}

#[derive(Clone, Debug)]
pub struct InputImage {
    pub source_path: String,
    pub preview_path: String,
    pub source_size: Option<ImageSize>,
    pub preview_size: Option<ImageSize>,
}

#[derive(Clone, Copy, Debug)]
pub struct ImageSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug)]
pub struct AlignAndAverageOutput {
    pub output_path: String,
    pub warnings: Vec<ProcessingWarning>,
}

#[derive(Clone, Debug)]
pub struct ProcessingWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug)]
pub enum StellaCompError {
    EmptyInput,
    InvalidBaseImageIndex { index: usize, len: usize },
    ImageLoad { path: String, message: String },
    ImageSave { path: String, message: String },
    OpenCv(String),
    InsufficientMatches { count: usize },
    InsufficientInliers { count: i32 },
    InvalidTransform(String),
    Average(String),
}

impl fmt::Display for StellaCompError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StellaCompError::EmptyInput => {
                write!(formatter, "at least one input image is required")
            }
            StellaCompError::InvalidBaseImageIndex { index, len } => {
                write!(
                    formatter,
                    "base image index {index} is out of range for {len} images"
                )
            }
            StellaCompError::ImageLoad { path, message } => {
                write!(formatter, "failed to load image {path}: {message}")
            }
            StellaCompError::ImageSave { path, message } => {
                write!(formatter, "failed to save image {path}: {message}")
            }
            StellaCompError::OpenCv(message) => write!(formatter, "OpenCV error: {message}"),
            StellaCompError::InsufficientMatches { count } => {
                write!(formatter, "insufficient feature matches: {count}")
            }
            StellaCompError::InsufficientInliers { count } => {
                write!(formatter, "insufficient RANSAC inliers: {count}")
            }
            StellaCompError::InvalidTransform(message) => {
                write!(formatter, "invalid affine transform: {message}")
            }
            StellaCompError::Average(message) => {
                write!(formatter, "average composite failed: {message}")
            }
        }
    }
}

impl std::error::Error for StellaCompError {}

pub fn align_and_average(
    input: AlignAndAverageInput,
) -> Result<AlignAndAverageOutput, StellaCompError> {
    if input.images.is_empty() {
        return Err(StellaCompError::EmptyInput);
    }

    if input.base_image_index >= input.images.len() {
        return Err(StellaCompError::InvalidBaseImageIndex {
            index: input.base_image_index,
            len: input.images.len(),
        });
    }

    if let Some(parent) = Path::new(&input.output_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|error| StellaCompError::ImageSave {
                path: parent.display().to_string(),
                message: error.to_string(),
            })?;
        }
    }

    let base_path = processing_path(&input.images[input.base_image_index]);
    let base_image = load_image(base_path)?;
    let mut warnings = Vec::new();
    let mut aligned_images = Vec::with_capacity(input.images.len());

    for (index, input_image) in input.images.iter().enumerate() {
        if !input_image.preview_path.is_empty()
            && input_image.preview_path != input_image.source_path
        {
            warnings.push(ProcessingWarning {
                code: "PREVIEW_ONLY_ALIGNMENT".to_string(),
                message: format!(
                    "image {index} used preview_path for MVP alignment; source_path transform is not applied yet"
                ),
            });
        }

        let image = load_image(processing_path(input_image))?;
        if index == input.base_image_index {
            aligned_images.push(image);
        } else {
            match align_to_base(&base_image, &image) {
                Ok(aligned_image) => aligned_images.push(aligned_image),
                Err(error) => warnings.push(ProcessingWarning {
                    code: "ALIGNMENT_SKIPPED".to_string(),
                    message: format!("image {index} was skipped: {error}"),
                }),
            }
        }
    }

    let averaged = average_images(&aligned_images).map_err(StellaCompError::Average)?;
    averaged
        .save(&input.output_path)
        .map_err(|error| StellaCompError::ImageSave {
            path: input.output_path.clone(),
            message: error.to_string(),
        })?;

    Ok(AlignAndAverageOutput {
        output_path: input.output_path,
        warnings,
    })
}

fn processing_path(input: &InputImage) -> &str {
    if !input.preview_path.is_empty() {
        &input.preview_path
    } else {
        &input.source_path
    }
}

fn load_image(path: &str) -> Result<DynamicImage, StellaCompError> {
    convert_to_dynamic_image(path).map_err(|message| StellaCompError::ImageLoad {
        path: path.to_string(),
        message,
    })
}

fn align_to_base(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
) -> Result<DynamicImage, StellaCompError> {
    let (k1, _, k2, _, matched_points) = matches(base_image, target_image)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

    if matched_points.len() < 3 {
        return Err(StellaCompError::InsufficientMatches {
            count: matched_points.len(),
        });
    }

    let mut base_points: Vector<Point2f> = Vector::new();
    let mut target_points: Vector<Point2f> = Vector::new();
    for matched_point in matched_points {
        base_points.push(
            k1.get(matched_point.query_idx as usize)
                .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
                .pt(),
        );
        target_points.push(
            k2.get(matched_point.train_idx as usize)
                .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
                .pt(),
        );
    }

    let mut inliers = Mat::default();
    let affine = estimate_affine_partial_2d(
        &target_points,
        &base_points,
        &mut inliers,
        RANSAC,
        3.0,
        2000,
        0.99,
        10,
    )
    .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

    if affine.empty() {
        return Err(StellaCompError::InvalidTransform(
            "RANSAC could not estimate a transform".to_string(),
        ));
    }

    let inlier_count =
        count_non_zero(&inliers).map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    if inlier_count < 2 {
        return Err(StellaCompError::InsufficientInliers {
            count: inlier_count,
        });
    }

    validate_partial_affine(&affine)?;

    let target_mat = dynamic_image_to_mat(target_image, IMREAD_COLOR);
    let mut converted = Mat::default();
    let (base_width, base_height) = base_image.dimensions();
    warp_affine(
        &target_mat,
        &mut converted,
        &affine,
        opencv::core::Size::new(base_width as i32, base_height as i32),
        1,
        0,
        Scalar::default(),
    )
    .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

    if converted.empty() {
        return Err(StellaCompError::OpenCv(
            "warp_affine produced an empty image".to_string(),
        ));
    }

    Ok(mat_to_dynamic_image(&converted))
}

fn validate_partial_affine(affine: &Mat) -> Result<(), StellaCompError> {
    let a = *affine
        .at_2d::<f64>(0, 0)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    let b = *affine
        .at_2d::<f64>(1, 0)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    let scale = (a * a + b * b).sqrt();

    if !(0.85..=1.15).contains(&scale) {
        return Err(StellaCompError::InvalidTransform(format!(
            "scale {scale:.3} is outside MVP limits"
        )));
    }

    Ok(())
}

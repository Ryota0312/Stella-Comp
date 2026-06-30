use crate::calc::matches;
use crate::imageproc::average_images;
use crate::stars::{detect_stars, match_stars, StarPoint};
use crate::utils::{convert_to_dynamic_image, dynamic_image_to_mat, mat_to_dynamic_image};
use image::{DynamicImage, GenericImageView};
use opencv::calib3d::{estimate_affine_partial_2d, find_homography, RANSAC};
use opencv::core::{
    count_non_zero, DMatch, KeyPointTraitConst, Mat, MatTraitConst, Point2f, Scalar, Vector,
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
pub struct EstimateTransformsInput {
    pub images: Vec<InputImage>,
    pub base_image_index: usize,
    pub alignment_method: AlignmentMethod,
    pub transform_model: TransformModel,
}

#[derive(Clone, Debug)]
pub struct EstimateTransformsOutput {
    pub transforms: Vec<ImageTransform>,
    pub warnings: Vec<ProcessingWarning>,
}

#[derive(Clone, Debug)]
pub struct ImageTransform {
    pub image_index: usize,
    pub affine: [f64; 6],
    pub homography: [f64; 9],
    pub transform_model: TransformModel,
    pub estimated: bool,
}

#[derive(Clone, Debug)]
pub struct ProcessingWarning {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlignmentMethod {
    Akaze,
    Stars,
}

impl AlignmentMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            AlignmentMethod::Akaze => "akaze",
            AlignmentMethod::Stars => "stars",
        }
    }

    pub fn from_wire(value: &str) -> Self {
        match value {
            "stars" => AlignmentMethod::Stars,
            _ => AlignmentMethod::Akaze,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FeatureMethod {
    Akaze,
    Stars,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransformModel {
    Affine,
    Homography,
}

impl TransformModel {
    pub fn as_str(self) -> &'static str {
        match self {
            TransformModel::Affine => "affine",
            TransformModel::Homography => "homography",
        }
    }

    pub fn from_wire(value: &str) -> Self {
        match value {
            "affine" => TransformModel::Affine,
            _ => TransformModel::Homography,
        }
    }
}

impl AlignmentMethod {
    fn feature_method(self) -> FeatureMethod {
        match self {
            AlignmentMethod::Akaze => FeatureMethod::Akaze,
            AlignmentMethod::Stars => FeatureMethod::Stars,
        }
    }
}

struct MatchedPointSet {
    base_points: Vector<Point2f>,
    target_points: Vector<Point2f>,
    match_count: usize,
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
                write!(formatter, "invalid transform: {message}")
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

pub fn estimate_transforms(
    input: EstimateTransformsInput,
) -> Result<EstimateTransformsOutput, StellaCompError> {
    if input.images.is_empty() {
        return Err(StellaCompError::EmptyInput);
    }

    if input.base_image_index >= input.images.len() {
        return Err(StellaCompError::InvalidBaseImageIndex {
            index: input.base_image_index,
            len: input.images.len(),
        });
    }

    let base_path = processing_path(&input.images[input.base_image_index]);
    let base_image = load_image(base_path)?;
    let mut warnings = Vec::new();
    let mut transforms = Vec::with_capacity(input.images.len());

    for (index, input_image) in input.images.iter().enumerate() {
        if !input_image.preview_path.is_empty()
            && input_image.preview_path != input_image.source_path
        {
            warnings.push(ProcessingWarning {
                code: "PREVIEW_ONLY_ALIGNMENT".to_string(),
                message: format!("image {index} transform is estimated in preview coordinates"),
            });
        }

        if index == input.base_image_index {
            transforms.push(ImageTransform {
                image_index: index,
                affine: identity_affine(),
                homography: identity_homography(),
                transform_model: input.transform_model,
                estimated: true,
            });
            continue;
        }

        let image = load_image(processing_path(input_image))?;
        match estimate_transform_to_base(
            &base_image,
            &image,
            input.alignment_method.feature_method(),
            input.transform_model,
        ) {
            Ok(transform) => transforms.push(ImageTransform {
                image_index: index,
                affine: transform.affine_values(),
                homography: transform.homography_values(),
                transform_model: input.transform_model,
                estimated: true,
            }),
            Err(error) => {
                warnings.push(ProcessingWarning {
                    code: "TRANSFORM_ESTIMATE_FAILED".to_string(),
                    message: format!("image {index} uses identity transform: {error}"),
                });
                transforms.push(ImageTransform {
                    image_index: index,
                    affine: identity_affine(),
                    homography: identity_homography(),
                    transform_model: input.transform_model,
                    estimated: false,
                });
            }
        }
    }

    Ok(EstimateTransformsOutput {
        transforms,
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
    let affine_values = estimate_affine_to_base(base_image, target_image, AlignmentMethod::Akaze)?;
    let affine = Mat::from_slice_2d(&[
        &[affine_values[0], affine_values[1], affine_values[2]],
        &[affine_values[3], affine_values[4], affine_values[5]],
    ])
    .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

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

fn estimate_affine_to_base(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
    alignment_method: AlignmentMethod,
) -> Result<[f64; 6], StellaCompError> {
    match estimate_transform_to_base(
        base_image,
        target_image,
        alignment_method.feature_method(),
        TransformModel::Affine,
    )? {
        EstimatedTransform::Affine(affine) => Ok(affine),
        EstimatedTransform::Homography(_) => Err(StellaCompError::InvalidTransform(
            "expected affine transform".to_string(),
        )),
    }
}

enum EstimatedTransform {
    Affine([f64; 6]),
    Homography([f64; 9]),
}

impl EstimatedTransform {
    fn affine_values(&self) -> [f64; 6] {
        match self {
            EstimatedTransform::Affine(affine) => *affine,
            EstimatedTransform::Homography(_) => identity_affine(),
        }
    }

    fn homography_values(&self) -> [f64; 9] {
        match self {
            EstimatedTransform::Affine(affine) => affine_to_homography(*affine),
            EstimatedTransform::Homography(homography) => *homography,
        }
    }
}

fn estimate_transform_to_base(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
    feature_method: FeatureMethod,
    transform_model: TransformModel,
) -> Result<EstimatedTransform, StellaCompError> {
    let matched_points = collect_matched_points(base_image, target_image, feature_method)?;
    match transform_model {
        TransformModel::Affine => Ok(EstimatedTransform::Affine(
            estimate_partial_affine_from_points(matched_points)?,
        )),
        TransformModel::Homography => Ok(EstimatedTransform::Homography(
            estimate_homography_from_points(matched_points, base_image.dimensions())?,
        )),
    }
}

fn collect_matched_points(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
    feature_method: FeatureMethod,
) -> Result<MatchedPointSet, StellaCompError> {
    match feature_method {
        FeatureMethod::Akaze => collect_akaze_matched_points(base_image, target_image),
        FeatureMethod::Stars => collect_star_matched_points(base_image, target_image),
    }
}

fn collect_akaze_matched_points(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
) -> Result<MatchedPointSet, StellaCompError> {
    let (base_keypoints, _, target_keypoints, _, matched_points) =
        matches(base_image, target_image)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

    if matched_points.len() < 3 {
        return Err(StellaCompError::InsufficientMatches {
            count: matched_points.len(),
        });
    }

    let mut base_points: Vector<Point2f> = Vector::new();
    let mut target_points: Vector<Point2f> = Vector::new();
    let match_count = matched_points.len();
    for matched_point in &matched_points {
        base_points.push(
            base_keypoints
                .get(matched_point.query_idx as usize)
                .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
                .pt(),
        );
        target_points.push(
            target_keypoints
                .get(matched_point.train_idx as usize)
                .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
                .pt(),
        );
    }

    Ok(MatchedPointSet {
        base_points,
        target_points,
        match_count,
    })
}

fn collect_star_matched_points(
    base_image: &DynamicImage,
    target_image: &DynamicImage,
) -> Result<MatchedPointSet, StellaCompError> {
    let base_stars = detect_stars(base_image);
    let target_stars = detect_stars(target_image);
    let matched_points = match_stars(&base_stars, &target_stars);

    if matched_points.len() < 3 {
        return Err(StellaCompError::InsufficientMatches {
            count: matched_points.len(),
        });
    }

    let (base_points, target_points) =
        star_matches_to_points(&base_stars, &target_stars, &matched_points)?;
    Ok(MatchedPointSet {
        base_points,
        target_points,
        match_count: matched_points.len(),
    })
}

fn star_matches_to_points(
    base_stars: &[StarPoint],
    target_stars: &[StarPoint],
    matched_points: &Vector<DMatch>,
) -> Result<(Vector<Point2f>, Vector<Point2f>), StellaCompError> {
    let mut base_points: Vector<Point2f> = Vector::new();
    let mut target_points: Vector<Point2f> = Vector::new();

    for matched_point in matched_points {
        let base_star = base_stars
            .get(matched_point.query_idx as usize)
            .ok_or_else(|| {
                StellaCompError::OpenCv("base star match index out of range".to_string())
            })?;
        let target_star = target_stars
            .get(matched_point.train_idx as usize)
            .ok_or_else(|| {
                StellaCompError::OpenCv("target star match index out of range".to_string())
            })?;
        base_points.push(Point2f::new(base_star.x, base_star.y));
        target_points.push(Point2f::new(target_star.x, target_star.y));
    }

    Ok((base_points, target_points))
}

fn estimate_partial_affine_from_points(
    matched_points: MatchedPointSet,
) -> Result<[f64; 6], StellaCompError> {
    let mut inliers = Mat::default();
    let affine = estimate_affine_partial_2d(
        &matched_points.target_points,
        &matched_points.base_points,
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
    if inlier_count < 3 {
        return Err(StellaCompError::InsufficientInliers {
            count: inlier_count,
        });
    }
    if inlier_count as usize > matched_points.match_count {
        return Err(StellaCompError::InvalidTransform(
            "RANSAC reported more inliers than matches".to_string(),
        ));
    }

    validate_partial_affine(&affine)?;

    mat_to_affine(&affine)
}

fn estimate_homography_from_points(
    matched_points: MatchedPointSet,
    base_dimensions: (u32, u32),
) -> Result<[f64; 9], StellaCompError> {
    if matched_points.match_count < 4 {
        return Err(StellaCompError::InsufficientMatches {
            count: matched_points.match_count,
        });
    }

    let mut inliers = Mat::default();
    let homography = find_homography(
        &matched_points.target_points,
        &matched_points.base_points,
        &mut inliers,
        RANSAC,
        3.0,
    )
    .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;

    if homography.empty() {
        return Err(StellaCompError::InvalidTransform(
            "RANSAC could not estimate a homography".to_string(),
        ));
    }

    let inlier_count =
        count_non_zero(&inliers).map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    if inlier_count < 4 {
        return Err(StellaCompError::InsufficientInliers {
            count: inlier_count,
        });
    }
    if inlier_count as usize > matched_points.match_count {
        return Err(StellaCompError::InvalidTransform(
            "RANSAC reported more inliers than matches".to_string(),
        ));
    }

    validate_homography(&homography, base_dimensions)?;

    mat_to_homography(&homography)
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

fn validate_homography(
    homography: &Mat,
    base_dimensions: (u32, u32),
) -> Result<(), StellaCompError> {
    let bottom_right = *homography
        .at_2d::<f64>(2, 2)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    if bottom_right.abs() <= f64::EPSILON {
        return Err(StellaCompError::InvalidTransform(
            "homography normalization term is zero".to_string(),
        ));
    }

    let a = *homography
        .at_2d::<f64>(0, 0)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
        / bottom_right;
    let d = *homography
        .at_2d::<f64>(1, 1)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
        / bottom_right;
    let perspective_x = *homography
        .at_2d::<f64>(2, 0)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
        / bottom_right;
    let perspective_y = *homography
        .at_2d::<f64>(2, 1)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
        / bottom_right;
    let scale = (a.abs() + d.abs()) / 2.0;
    if !(0.70..=1.30).contains(&scale) {
        return Err(StellaCompError::InvalidTransform(format!(
            "homography scale {scale:.3} is outside MVP limits"
        )));
    }

    let (width, height) = base_dimensions;
    let max_perspective_shift =
        (perspective_x.abs() * width as f64) + (perspective_y.abs() * height as f64);
    if max_perspective_shift > 0.10 {
        return Err(StellaCompError::InvalidTransform(format!(
            "homography perspective shift {max_perspective_shift:.3} is outside MVP limits"
        )));
    }

    for (x, y) in [
        (0.0, 0.0),
        (width.saturating_sub(1) as f64, 0.0),
        (0.0, height.saturating_sub(1) as f64),
        (
            width.saturating_sub(1) as f64,
            height.saturating_sub(1) as f64,
        ),
    ] {
        let denominator = perspective_x * x + perspective_y * y + 1.0;
        if !denominator.is_finite() || !(0.90..=1.10).contains(&denominator) {
            return Err(StellaCompError::InvalidTransform(format!(
                "homography corner denominator {denominator:.3} is outside MVP limits"
            )));
        }
    }

    Ok(())
}

fn mat_to_affine(affine: &Mat) -> Result<[f64; 6], StellaCompError> {
    Ok([
        *affine
            .at_2d::<f64>(0, 0)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
        *affine
            .at_2d::<f64>(0, 1)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
        *affine
            .at_2d::<f64>(0, 2)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
        *affine
            .at_2d::<f64>(1, 0)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
        *affine
            .at_2d::<f64>(1, 1)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
        *affine
            .at_2d::<f64>(1, 2)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?,
    ])
}

fn mat_to_homography(homography: &Mat) -> Result<[f64; 9], StellaCompError> {
    let bottom_right = *homography
        .at_2d::<f64>(2, 2)
        .map_err(|error| StellaCompError::OpenCv(error.to_string()))?;
    if bottom_right.abs() <= f64::EPSILON {
        return Err(StellaCompError::InvalidTransform(
            "homography normalization term is zero".to_string(),
        ));
    }

    Ok([
        *homography
            .at_2d::<f64>(0, 0)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(0, 1)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(0, 2)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(1, 0)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(1, 1)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(1, 2)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(2, 0)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        *homography
            .at_2d::<f64>(2, 1)
            .map_err(|error| StellaCompError::OpenCv(error.to_string()))?
            / bottom_right,
        1.0,
    ])
}

fn identity_affine() -> [f64; 6] {
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
}

fn identity_homography() -> [f64; 9] {
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
}

fn affine_to_homography(affine: [f64; 6]) -> [f64; 9] {
    [
        affine[0], affine[1], affine[2], affine[3], affine[4], affine[5], 0.0, 0.0, 1.0,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Luma};

    #[test]
    fn alignment_method_from_wire_keeps_legacy_default() {
        assert_eq!(AlignmentMethod::from_wire("stars"), AlignmentMethod::Stars);
        assert_eq!(AlignmentMethod::from_wire("akaze"), AlignmentMethod::Akaze);
        assert_eq!(AlignmentMethod::from_wire(""), AlignmentMethod::Akaze);
        assert_eq!(
            AlignmentMethod::from_wire("unknown"),
            AlignmentMethod::Akaze
        );
    }

    #[test]
    fn transform_model_from_wire_defaults_to_homography() {
        assert_eq!(TransformModel::from_wire("homography"), TransformModel::Homography);
        assert_eq!(TransformModel::from_wire("affine"), TransformModel::Affine);
        assert_eq!(TransformModel::from_wire(""), TransformModel::Homography);
        assert_eq!(TransformModel::from_wire("unknown"), TransformModel::Homography);
    }

    #[test]
    fn star_alignment_estimates_translation() {
        let base = synthetic_star_image(0, 0);
        let target = synthetic_star_image(7, -4);

        let affine =
            estimate_affine_to_base(&base, &target, AlignmentMethod::Stars).expect("affine");

        assert!((affine[0] - 1.0).abs() < 0.05, "x scale = {}", affine[0]);
        assert!((affine[4] - 1.0).abs() < 0.05, "y scale = {}", affine[4]);
        assert!(
            (affine[2] + 7.0).abs() < 1.5,
            "x translation = {}",
            affine[2]
        );
        assert!(
            (affine[5] - 4.0).abs() < 1.5,
            "y translation = {}",
            affine[5]
        );
    }

    #[test]
    fn star_homography_estimates_translation() {
        let mut base_points: Vector<Point2f> = Vector::new();
        let mut target_points: Vector<Point2f> = Vector::new();
        for (x, y) in [
            (45.0, 42.0),
            (150.0, 36.0),
            (172.0, 104.0),
            (62.0, 125.0),
            (198.0, 148.0),
        ] {
            base_points.push(Point2f::new(x, y));
            target_points.push(Point2f::new(x + 7.0, y - 4.0));
        }

        let homography = estimate_homography_from_points(
            MatchedPointSet {
                base_points,
                target_points,
                match_count: 5,
            },
            (220, 180),
        )
        .expect("homography");

        assert!(
            (homography[0] - 1.0).abs() < 0.05,
            "x scale = {}",
            homography[0]
        );
        assert!(
            (homography[4] - 1.0).abs() < 0.05,
            "y scale = {}",
            homography[4]
        );
        assert!(
            (homography[2] + 7.0).abs() < 1.5,
            "x translation = {}",
            homography[2]
        );
        assert!(
            (homography[5] - 4.0).abs() < 1.5,
            "y translation = {}",
            homography[5]
        );
    }

    #[test]
    fn homography_validation_rejects_strong_perspective_shift() {
        let homography =
            Mat::from_slice_2d(&[&[1.0, 0.0, 0.0], &[0.0, 1.0, 0.0], &[0.0008, 0.0, 1.0]])
                .expect("homography mat");

        let error = validate_homography(&homography, (220, 180)).expect_err("invalid homography");

        assert!(
            error.to_string().contains("homography perspective shift"),
            "error = {error}"
        );
    }

    fn synthetic_star_image(offset_x: i32, offset_y: i32) -> DynamicImage {
        let mut image = ImageBuffer::from_pixel(220, 180, Luma([8_u8]));
        let stars = [
            (45, 42, 230),
            (88, 58, 190),
            (150, 36, 210),
            (172, 104, 180),
            (112, 132, 240),
            (62, 125, 170),
            (136, 86, 200),
            (198, 148, 185),
        ];

        for (x, y, value) in stars {
            draw_star(&mut image, x + offset_x, y + offset_y, value);
        }

        DynamicImage::ImageLuma8(image)
    }

    fn draw_star(
        image: &mut ImageBuffer<Luma<u8>, Vec<u8>>,
        center_x: i32,
        center_y: i32,
        value: u8,
    ) {
        for y in center_y - 1..=center_y + 1 {
            for x in center_x - 1..=center_x + 1 {
                if x < 0 || y < 0 || x >= image.width() as i32 || y >= image.height() as i32 {
                    continue;
                }
                let distance = (x - center_x).abs() + (y - center_y).abs();
                let pixel_value = if distance == 0 {
                    value
                } else {
                    value.saturating_sub(45)
                };
                image.put_pixel(x as u32, y as u32, Luma([pixel_value]));
            }
        }
    }
}

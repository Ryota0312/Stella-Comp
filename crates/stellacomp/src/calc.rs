use crate::utils::dynamic_image_to_mat;
use image::DynamicImage;
use opencv::core::{no_array, DMatch, KeyPoint, Mat, Vector, NORM_HAMMING};
use opencv::features2d::AKAZE_DescriptorType::DESCRIPTOR_MLDB;
use opencv::features2d::KAZE_DiffusivityType::DIFF_PM_G2;
use opencv::features2d::{BFMatcher, DescriptorMatcherTraitConst, Feature2DTrait, AKAZE};
use opencv::imgcodecs::IMREAD_GRAYSCALE;
use opencv::types::{VectorOfDMatch, VectorOfKeyPoint};

const AKAZE_THRESHOLD: f32 = 0.0001;
const MAX_MATCH_DISTANCE: f32 = 60.0;

pub fn matches(
    image1: &DynamicImage,
    image2: &DynamicImage,
) -> opencv::Result<(Vector<KeyPoint>, Mat, Vector<KeyPoint>, Mat, Vector<DMatch>)> {
    let (k1, d1) = get_keypoints_and_descriptor(image1)?;
    let (k2, d2) = get_keypoints_and_descriptor(image2)?;

    let bf_matcher = BFMatcher::create(NORM_HAMMING, true)?;

    let mut matches = VectorOfDMatch::new();
    bf_matcher.train_match(&d1, &d2, &mut matches, &no_array())?;

    let mut good_matches = VectorOfDMatch::new();
    for m in &matches {
        if m.distance < MAX_MATCH_DISTANCE {
            good_matches.push(m);
        }
    }

    Ok((k1, d1, k2, d2, good_matches))
}

pub fn get_keypoints_and_descriptor(
    image: &DynamicImage,
) -> opencv::Result<(Vector<KeyPoint>, Mat)> {
    let mut akaze = AKAZE::create(DESCRIPTOR_MLDB, 0, 3, AKAZE_THRESHOLD, 4, 4, DIFF_PM_G2)?;
    let mut key_points = VectorOfKeyPoint::new();
    let mut descriptors = Mat::default();
    akaze.detect_and_compute(
        &dynamic_image_to_mat(image, IMREAD_GRAYSCALE),
        &[],
        &mut key_points,
        &mut descriptors,
        false,
    )?;

    Ok((key_points, descriptors))
}

use image::{DynamicImage, GenericImageView};
use opencv::core::{DMatch, Vector};
use std::cmp::Ordering;

const MAX_STARS: usize = 600;
const DESCRIPTOR_NEIGHBORS: usize = 5;
const MATCH_DISTANCE_LIMIT: f32 = 0.8;
const BRIGHTNESS_RANK_MATCH_LIMIT: usize = 80;
const MIN_STAR_SEPARATION: f32 = 5.0;
const BACKGROUND_RADIUS: u32 = 12;

#[derive(Clone, Copy, Debug)]
pub struct StarPoint {
    pub x: f32,
    pub y: f32,
    pub brightness: f32,
}

#[derive(Clone, Debug)]
struct StarDescriptor {
    ratios: [f32; DESCRIPTOR_NEIGHBORS],
    brightness_rank: f32,
}

pub fn detect_stars(image: &DynamicImage) -> Vec<StarPoint> {
    let grayscale = image.to_luma8();
    let (width, height) = image.dimensions();
    if width < BACKGROUND_RADIUS * 2 + 3 || height < BACKGROUND_RADIUS * 2 + 3 {
        return Vec::new();
    }

    let luminance: Vec<f32> = grayscale.pixels().map(|pixel| pixel[0] as f32).collect();
    let integral = integral_image(&luminance, width as usize, height as usize);
    let mut signal = vec![0.0_f32; luminance.len()];
    let mut positive_values = Vec::new();

    for y in BACKGROUND_RADIUS..height - BACKGROUND_RADIUS {
        for x in BACKGROUND_RADIUS..width - BACKGROUND_RADIUS {
            let index = (y * width + x) as usize;
            let background = box_mean(
                &integral,
                width as usize,
                x - BACKGROUND_RADIUS,
                y - BACKGROUND_RADIUS,
                x + BACKGROUND_RADIUS,
                y + BACKGROUND_RADIUS,
            );
            let value = (luminance[index] - background).max(0.0);
            signal[index] = value;
            if value > 0.0 {
                positive_values.push(value);
            }
        }
    }

    if positive_values.is_empty() {
        return Vec::new();
    }

    let mean = positive_values.iter().sum::<f32>() / positive_values.len() as f32;
    let variance = positive_values
        .iter()
        .map(|value| {
            let delta = value - mean;
            delta * delta
        })
        .sum::<f32>()
        / positive_values.len() as f32;
    let threshold = (mean + variance.sqrt() * 1.5).max(6.0);

    let mut candidates = Vec::new();
    for y in BACKGROUND_RADIUS + 1..height - BACKGROUND_RADIUS - 1 {
        for x in BACKGROUND_RADIUS + 1..width - BACKGROUND_RADIUS - 1 {
            let index = (y * width + x) as usize;
            let value = signal[index];
            if value < threshold || !is_local_maximum(&signal, width, x, y, value) {
                continue;
            }

            let (centroid_x, centroid_y) = weighted_centroid(&signal, width, height, x, y);
            candidates.push(StarPoint {
                x: centroid_x,
                y: centroid_y,
                brightness: value,
            });
        }
    }

    candidates.sort_by(|left, right| {
        right
            .brightness
            .partial_cmp(&left.brightness)
            .unwrap_or(Ordering::Equal)
    });

    let mut stars = Vec::new();
    for candidate in candidates {
        if stars.iter().any(|star: &StarPoint| {
            squared_distance(*star, candidate) < MIN_STAR_SEPARATION.powi(2)
        }) {
            continue;
        }
        stars.push(candidate);
        if stars.len() >= MAX_STARS {
            break;
        }
    }

    stars
}

pub fn match_stars(base_stars: &[StarPoint], target_stars: &[StarPoint]) -> Vector<DMatch> {
    let base_descriptors = describe_stars(base_stars);
    let target_descriptors = describe_stars(target_stars);
    let mut matches = Vector::new();

    for (base_index, base_descriptor) in base_descriptors.iter().enumerate() {
        let Some((target_index, base_distance)) =
            nearest_descriptor(base_descriptor, &target_descriptors)
        else {
            continue;
        };
        if base_distance > MATCH_DISTANCE_LIMIT {
            continue;
        }

        let Some((reverse_index, _)) =
            nearest_descriptor(&target_descriptors[target_index], &base_descriptors)
        else {
            continue;
        };
        if reverse_index != base_index {
            continue;
        }

        if let Ok(match_point) = DMatch::new(base_index as i32, target_index as i32, base_distance)
        {
            matches.push(match_point);
        }
    }

    if matches.len() < 3 {
        return match_brightest_by_rank(base_stars, target_stars);
    }

    matches
}

fn match_brightest_by_rank(base_stars: &[StarPoint], target_stars: &[StarPoint]) -> Vector<DMatch> {
    let mut matches = Vector::new();
    let limit = base_stars
        .len()
        .min(target_stars.len())
        .min(BRIGHTNESS_RANK_MATCH_LIMIT);

    for index in 0..limit {
        if let Ok(match_point) = DMatch::new(index as i32, index as i32, index as f32) {
            matches.push(match_point);
        }
    }

    matches
}

fn integral_image(luminance: &[f32], width: usize, height: usize) -> Vec<f32> {
    let mut integral = vec![0.0; (width + 1) * (height + 1)];
    for y in 0..height {
        let mut row_sum = 0.0;
        for x in 0..width {
            row_sum += luminance[y * width + x];
            integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row_sum;
        }
    }
    integral
}

fn box_mean(integral: &[f32], width: usize, left: u32, top: u32, right: u32, bottom: u32) -> f32 {
    let stride = width + 1;
    let left = left as usize;
    let top = top as usize;
    let right = right as usize + 1;
    let bottom = bottom as usize + 1;
    let sum = integral[bottom * stride + right]
        - integral[top * stride + right]
        - integral[bottom * stride + left]
        + integral[top * stride + left];
    sum / ((right - left) * (bottom - top)) as f32
}

fn is_local_maximum(signal: &[f32], width: u32, x: u32, y: u32, value: f32) -> bool {
    for neighbor_y in y - 1..=y + 1 {
        for neighbor_x in x - 1..=x + 1 {
            if neighbor_x == x && neighbor_y == y {
                continue;
            }
            if signal[(neighbor_y * width + neighbor_x) as usize] >= value {
                return false;
            }
        }
    }
    true
}

fn weighted_centroid(signal: &[f32], width: u32, height: u32, x: u32, y: u32) -> (f32, f32) {
    let mut total = 0.0;
    let mut weighted_x = 0.0;
    let mut weighted_y = 0.0;

    for sample_y in y.saturating_sub(1)..=(y + 1).min(height - 1) {
        for sample_x in x.saturating_sub(1)..=(x + 1).min(width - 1) {
            let value = signal[(sample_y * width + sample_x) as usize];
            total += value;
            weighted_x += sample_x as f32 * value;
            weighted_y += sample_y as f32 * value;
        }
    }

    if total <= f32::EPSILON {
        (x as f32, y as f32)
    } else {
        (weighted_x / total, weighted_y / total)
    }
}

fn describe_stars(stars: &[StarPoint]) -> Vec<StarDescriptor> {
    stars
        .iter()
        .enumerate()
        .map(|(index, star)| {
            let mut distances: Vec<f32> = stars
                .iter()
                .enumerate()
                .filter_map(|(other_index, other)| {
                    if index == other_index {
                        None
                    } else {
                        Some(squared_distance(*star, *other).sqrt())
                    }
                })
                .collect();
            distances.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));

            let anchor = distances.first().copied().unwrap_or(1.0).max(1.0);
            let mut ratios = [0.0; DESCRIPTOR_NEIGHBORS];
            for (ratio_index, ratio) in ratios.iter_mut().enumerate() {
                *ratio = distances
                    .get(ratio_index)
                    .map(|distance| distance / anchor)
                    .unwrap_or(0.0);
            }

            StarDescriptor {
                ratios,
                brightness_rank: index as f32 / stars.len().max(1) as f32,
            }
        })
        .collect()
}

fn nearest_descriptor(
    descriptor: &StarDescriptor,
    candidates: &[StarDescriptor],
) -> Option<(usize, f32)> {
    candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| (index, descriptor_distance(descriptor, candidate)))
        .min_by(|(_, left), (_, right)| left.partial_cmp(right).unwrap_or(Ordering::Equal))
}

fn descriptor_distance(left: &StarDescriptor, right: &StarDescriptor) -> f32 {
    let ratios = left
        .ratios
        .iter()
        .zip(right.ratios.iter())
        .map(|(left, right)| (left - right).abs())
        .sum::<f32>()
        / DESCRIPTOR_NEIGHBORS as f32;
    let brightness = (left.brightness_rank - right.brightness_rank).abs();
    ratios + brightness * 0.2
}

fn squared_distance(left: StarPoint, right: StarPoint) -> f32 {
    let x = left.x - right.x;
    let y = left.y - right.y;
    x * x + y * y
}

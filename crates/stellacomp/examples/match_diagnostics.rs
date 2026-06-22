use std::env;

use stellacomp::calc::{get_keypoints_and_descriptor, matches};
use stellacomp::utils::convert_to_dynamic_image;

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let base_path = args
        .next()
        .ok_or_else(|| "usage: match_diagnostics <base-image> <target-image>...".to_string())?;
    let target_paths: Vec<String> = args.collect();
    if target_paths.is_empty() {
        return Err("at least one target image is required".to_string());
    }

    let base_image = convert_to_dynamic_image(&base_path)?;
    let (base_keypoints, _) =
        get_keypoints_and_descriptor(&base_image).map_err(|error| error.to_string())?;
    println!("{base_path}\tkeypoints={}", base_keypoints.len());

    for target_path in target_paths {
        let target_image = convert_to_dynamic_image(&target_path)?;
        let (target_keypoints, _) =
            get_keypoints_and_descriptor(&target_image).map_err(|error| error.to_string())?;
        let (_, _, _, _, good_matches) =
            matches(&base_image, &target_image).map_err(|error| error.to_string())?;
        println!(
            "{target_path}\tkeypoints={}\tgood_matches={}",
            target_keypoints.len(),
            good_matches.len()
        );
    }

    Ok(())
}

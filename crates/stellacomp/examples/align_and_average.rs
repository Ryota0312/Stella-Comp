use std::env;

use stellacomp::{align_and_average, AlignAndAverageInput, InputImage};

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let output_path = args
        .next()
        .ok_or_else(|| "usage: align_and_average <output-path> <input-image>...".to_string())?;
    let image_paths: Vec<String> = args.collect();
    if image_paths.is_empty() {
        return Err("at least one input image is required".to_string());
    }

    let output = align_and_average(AlignAndAverageInput {
        images: image_paths
            .into_iter()
            .map(|path| InputImage {
                source_path: path.clone(),
                preview_path: path,
                source_size: None,
                preview_size: None,
            })
            .collect(),
        output_path,
        base_image_index: 0,
    })
    .map_err(|error| error.to_string())?;

    println!("output_path={}", output.output_path);
    for warning in output.warnings {
        println!("warning {}: {}", warning.code, warning.message);
    }

    Ok(())
}

pub mod calc;
pub mod imageproc;
pub mod pipeline;
pub mod stars;
pub mod utils;

pub use pipeline::{
    align_and_average, estimate_transforms, AlignAndAverageInput, AlignAndAverageOutput,
    AlignmentMethod, EstimateTransformsInput, EstimateTransformsOutput, ImageSize, ImageTransform,
    InputImage, ProcessingWarning, StellaCompError,
};

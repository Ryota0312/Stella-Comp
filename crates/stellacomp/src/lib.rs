pub mod calc;
pub mod imageproc;
pub mod pipeline;
pub mod utils;

pub use pipeline::{
    align_and_average, AlignAndAverageInput, AlignAndAverageOutput, ImageSize, InputImage,
    ProcessingWarning, StellaCompError,
};

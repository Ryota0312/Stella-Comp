fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure().build_server(true).compile_protos(
        &["../../proto/stellacomp/v1/processor.proto"],
        &["../../proto"],
    )?;
    Ok(())
}

use std::net::SocketAddr;
use std::{env, error::Error};
use tonic::{transport::Server, Request, Response, Status};

use pb::image_processor_server::{ImageProcessor, ImageProcessorServer};
use pb::{
    AlignAndAverageRequest, AlignAndAverageResponse, EstimateTransformsRequest,
    EstimateTransformsResponse, ImageTransform, ProcessingWarning,
};

pub mod pb {
    tonic::include_proto!("stellacomp.v1");
}

#[derive(Debug, Default)]
struct WorkerService;

#[tonic::async_trait]
impl ImageProcessor for WorkerService {
    async fn align_and_average(
        &self,
        request: Request<AlignAndAverageRequest>,
    ) -> Result<Response<AlignAndAverageResponse>, Status> {
        let request = request.into_inner();
        let base_image_index = usize::try_from(request.base_image_index)
            .map_err(|_| Status::invalid_argument("base_image_index must be zero or greater"))?;

        let input = stellacomp::AlignAndAverageInput {
            images: request
                .images
                .into_iter()
                .map(|image| stellacomp::InputImage {
                    source_path: image.source_path,
                    preview_path: image.preview_path,
                    source_size: image.source_size.map(to_stellacomp_size),
                    preview_size: image.preview_size.map(to_stellacomp_size),
                })
                .collect(),
            output_path: request.output_path,
            base_image_index,
        };

        let output = stellacomp::align_and_average(input)
            .map_err(|error| Status::internal(error.to_string()))?;

        Ok(Response::new(AlignAndAverageResponse {
            output_path: output.output_path,
            warnings: output
                .warnings
                .into_iter()
                .map(|warning| ProcessingWarning {
                    code: warning.code,
                    message: warning.message,
                })
                .collect(),
        }))
    }

    async fn estimate_transforms(
        &self,
        request: Request<EstimateTransformsRequest>,
    ) -> Result<Response<EstimateTransformsResponse>, Status> {
        let request = request.into_inner();
        let base_image_index = usize::try_from(request.base_image_index)
            .map_err(|_| Status::invalid_argument("base_image_index must be zero or greater"))?;

        let input = stellacomp::EstimateTransformsInput {
            images: request
                .images
                .into_iter()
                .map(|image| stellacomp::InputImage {
                    source_path: image.source_path,
                    preview_path: image.preview_path,
                    source_size: image.source_size.map(to_stellacomp_size),
                    preview_size: image.preview_size.map(to_stellacomp_size),
                })
                .collect(),
            base_image_index,
            alignment_method: stellacomp::AlignmentMethod::from_wire(&request.alignment_method),
        };

        let output = stellacomp::estimate_transforms(input)
            .map_err(|error| Status::internal(error.to_string()))?;

        Ok(Response::new(EstimateTransformsResponse {
            transforms: output
                .transforms
                .into_iter()
                .map(|transform| ImageTransform {
                    image_index: transform.image_index as u32,
                    affine: transform.affine.to_vec(),
                    estimated: transform.estimated,
                })
                .collect(),
            warnings: output
                .warnings
                .into_iter()
                .map(|warning| ProcessingWarning {
                    code: warning.code,
                    message: warning.message,
                })
                .collect(),
        }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let address = env::var("STELLA_COMP_WORKER_ADDR").unwrap_or_else(|_| "[::1]:50051".to_string());
    let address: SocketAddr = address.parse()?;

    Server::builder()
        .add_service(ImageProcessorServer::new(WorkerService))
        .serve(address)
        .await?;

    Ok(())
}

fn to_stellacomp_size(size: pb::ImageSize) -> stellacomp::ImageSize {
    stellacomp::ImageSize {
        width: size.width,
        height: size.height,
    }
}

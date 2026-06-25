package processor

import (
	"context"

	stellacompv1 "github.com/Ryota0312/stella-comp/apps/api/internal/gen/stellacomp/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type GRPC struct {
	Address string
}

func (processor GRPC) AlignAndAverage(ctx context.Context, request *stellacompv1.AlignAndAverageRequest) (*stellacompv1.AlignAndAverageResponse, error) {
	connection, err := grpc.DialContext(ctx, processor.Address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	defer connection.Close()

	client := stellacompv1.NewImageProcessorClient(connection)
	return client.AlignAndAverage(ctx, request)
}

func (processor GRPC) EstimateTransforms(ctx context.Context, request *stellacompv1.EstimateTransformsRequest) (*stellacompv1.EstimateTransformsResponse, error) {
	connection, err := grpc.DialContext(ctx, processor.Address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	defer connection.Close()

	client := stellacompv1.NewImageProcessorClient(connection)
	return client.EstimateTransforms(ctx, request)
}

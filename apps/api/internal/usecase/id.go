package usecase

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type IDGenerator func() string

func NewID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return hex.EncodeToString(bytes[:])
}

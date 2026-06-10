package postgres

import (
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"github.com/scaleforge/scaleforge/internal/repository"
)

type scannable interface {
	Scan(dest ...any) error
}

func scanArchitecture(rows pgx.Rows) (*repository.Architecture, error) {
	var arch repository.Architecture
	var graphBytes, trafficBytes []byte

	err := rows.Scan(&arch.ID, &arch.UserID, &arch.Name, &graphBytes, &trafficBytes, &arch.CreatedAt, &arch.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(graphBytes, &arch.Graph); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(trafficBytes, &arch.Traffic); err != nil {
		return nil, err
	}

	return &arch, nil
}

func scanArchitectureRow(row scannable) (*repository.Architecture, error) {
	var arch repository.Architecture
	var graphBytes, trafficBytes []byte

	err := row.Scan(&arch.ID, &arch.UserID, &arch.Name, &graphBytes, &trafficBytes, &arch.CreatedAt, &arch.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(graphBytes, &arch.Graph); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(trafficBytes, &arch.Traffic); err != nil {
		return nil, err
	}

	return &arch, nil
}

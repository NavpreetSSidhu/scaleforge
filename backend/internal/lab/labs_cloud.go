package lab

import "github.com/scaleforge/scaleforge/internal/dockerx"

// The AWS labs run against floci (https://github.com/floci-io/floci), an MIT
// licensed local AWS emulator, driven with the genuine AWS CLI.
//
// These labs are marked FidelityEmulated deliberately. The API surface and data
// model are faithful enough to learn against — conditional writes really are
// rejected, dead-letter redrive really does move a message — but an emulator is
// not the service: throughput, quotas, eventual-consistency timing and failure
// modes are not reproduced. The catalog says so rather than implying parity.
const (
	fociImage = "floci/floci:latest"
	awsCLI    = "amazon/aws-cli:latest"
)

// fociService builds the emulator container. FLOCI_HOSTNAME matters more than it
// looks: without it the emulator hands back resource URLs pointing at
// "localhost", which resolve to the *workstation* container rather than to the
// emulator, so every follow-up call fails.
func fociService() Service {
	return Service{
		Name:  "floci",
		Image: fociImage,
		Env:   []string{"FLOCI_HOSTNAME=floci", "FLOCI_DEFAULT_REGION=us-east-1"},
		Ports: []dockerx.PortMap{{Label: "AWS endpoint", Container: "4566", Scheme: "http"}},
	}
}

// awsWorkstation is the real AWS CLI, pointed at the emulator. Credentials may be
// any non-empty value.
func awsWorkstation() Workstation {
	return Workstation{
		Image:      awsCLI,
		Entrypoint: "/bin/sh",
		Env: []string{
			"AWS_ACCESS_KEY_ID=scaleforge",
			"AWS_SECRET_ACCESS_KEY=scaleforge",
			"AWS_DEFAULT_REGION=us-east-1",
			"AWS_ENDPOINT_URL=http://floci:4566",
		},
	}
}

const emulatorNote = "Runs against the floci AWS emulator, not AWS. The API and data model are " +
	"faithful — conditional writes are rejected, dead-letter redrive really moves messages — but " +
	"throughput, quotas, and eventual-consistency timing are not reproduced."

// dynamoLab teaches the DynamoDB data model, where almost every production
// mistake traces back to the key schema chosen on day one.
func dynamoLab() Lab {
	return Lab{
		ID:           "dynamodb-modeling",
		Toolchain:    "AWS CLI v2 (`aws`) pointed at the floci emulator; AWS_ENDPOINT_URL and credentials are preset. Busybox shell.",
		Title:        "DynamoDB: Keys, Indexes & Conditional Writes",
		Track:        TrackCloudAPI,
		Difficulty:   Intermediate,
		Minutes:      30,
		Verified:     true,
		Fidelity:     FidelityEmulated,
		FidelityNote: emulatorNote,
		Blurb:        "Model a table the way DynamoDB wants you to. Partition and sort keys, querying by key instead of scanning, a secondary index, and the conditional write that makes concurrent updates safe.",
		Concepts:     []string{"Partition & sort keys", "Query vs Scan", "Global secondary indexes", "Conditional writes", "TTL"},
		Services:     []Service{fociService()},
		Workstation:  awsWorkstation(),
		Ready:        "aws dynamodb list-tables >/dev/null 2>&1",
		Tasks: []Task{
			{
				ID:    "create-table",
				Title: "Create a table with a composite key",
				Brief: "DynamoDB's **partition key** decides where an item lives; the optional **sort key** orders items inside that partition and is what makes range queries possible.\n\nCreate table `orders` with partition key `customerId` and sort key `orderedAt` (both strings), on-demand billing.",
				Hint:  "aws dynamodb create-table --table-name orders \\\n  --attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderedAt,AttributeType=S \\\n  --key-schema AttributeName=customerId,KeyType=HASH AttributeName=orderedAt,KeyType=RANGE \\\n  --billing-mode PAY_PER_REQUEST",
				Check: "aws dynamodb describe-table --table-name orders --query 'Table.KeySchema[?KeyType==`HASH`].AttributeName' --output text 2>/dev/null | grep -q customerId && aws dynamodb describe-table --table-name orders --query 'Table.KeySchema[?KeyType==`RANGE`].AttributeName' --output text | grep -q orderedAt",
				Pass:  "Table `orders` exists with a `customerId` / `orderedAt` composite key.",
				Fail:  "No table `orders` with that composite key yet.",
			},
			{
				ID:    "put-items",
				Title: "Write three orders for one customer",
				Brief: "Items in the same partition share a `customerId` and are ordered by `orderedAt`. Write **three** orders for `c-1` with different `orderedAt` values, each carrying an `orderStatus` of `paid` or `pending`.",
				Hint:  "aws dynamodb put-item --table-name orders --item '{\"customerId\":{\"S\":\"c-1\"},\"orderedAt\":{\"S\":\"2026-01-01\"},\"orderStatus\":{\"S\":\"paid\"}}'\n# repeat for 2026-01-02 and 2026-01-03",
				Check: "[ \"$(aws dynamodb query --table-name orders --key-condition-expression 'customerId = :c' --expression-attribute-values '{\":c\":{\"S\":\"c-1\"}}' --query Count --output text 2>/dev/null)\" -ge 3 ]",
				Pass:  "Customer `c-1` has 3 or more orders.",
				Fail:  "Fewer than 3 orders for `c-1`.",
			},
			{
				ID:    "range-query",
				Title: "Query a range instead of scanning",
				Brief: "A **Scan** reads the whole table and filters; a **Query** goes straight to one partition and walks the sort key. On a real table that is the difference between a few reads and a bill.\n\nProve the sort key works: add an order dated `2026-02-01`, then query `c-1` for orders on or after `2026-02-01` only.",
				Hint:  "aws dynamodb put-item --table-name orders --item '{\"customerId\":{\"S\":\"c-1\"},\"orderedAt\":{\"S\":\"2026-02-01\"},\"orderStatus\":{\"S\":\"pending\"}}'\naws dynamodb query --table-name orders \\\n  --key-condition-expression 'customerId = :c AND orderedAt >= :from' \\\n  --expression-attribute-values '{\":c\":{\"S\":\"c-1\"},\":from\":{\"S\":\"2026-02-01\"}}'",
				Check: "[ \"$(aws dynamodb query --table-name orders --key-condition-expression 'customerId = :c AND orderedAt >= :from' --expression-attribute-values '{\":c\":{\"S\":\"c-1\"},\":from\":{\"S\":\"2026-02-01\"}}' --query Count --output text 2>/dev/null)\" -ge 1 ]",
				Pass:  "A sort-key range query returns the February order.",
				Fail:  "No order at or after `2026-02-01` for `c-1` yet.",
			},
			{
				ID:    "gsi",
				Title: "Add a secondary index for a different access pattern",
				Brief: "You can only Query by the table's key. Asking \"which orders are still pending?\" needs a **global secondary index** keyed on `orderStatus`.\n\nCreate a GSI named `byStatus` with `orderStatus` as its partition key.\n\n(Note the attribute is `orderStatus`, not `status` — `status` is a DynamoDB **reserved word** and would need an expression attribute name.)",
				Hint:  "aws dynamodb update-table --table-name orders \\\n  --attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderedAt,AttributeType=S AttributeName=orderStatus,AttributeType=S \\\n  --global-secondary-index-updates '[{\"Create\":{\"IndexName\":\"byStatus\",\"KeySchema\":[{\"AttributeName\":\"orderStatus\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}}]'",
				Check: "aws dynamodb describe-table --table-name orders --query 'Table.GlobalSecondaryIndexes[].IndexName' --output text 2>/dev/null | grep -q byStatus",
				Pass:  "GSI `byStatus` exists — pending orders are now queryable.",
				Fail:  "No global secondary index named `byStatus`.",
			},
			{
				ID:    "conditional-write",
				Title: "Make a write safe under concurrency",
				Brief: "Two writers doing read-then-write will silently clobber each other. A **condition expression** makes the write fail instead, so the loser can retry with fresh data.\n\nAdd a `version` number to one order, then update it **only if** the version still matches — leaving it at `2`. Try the same update again and watch it be rejected with `ConditionalCheckFailedException`.",
				Hint:  "aws dynamodb update-item --table-name orders \\\n  --key '{\"customerId\":{\"S\":\"c-1\"},\"orderedAt\":{\"S\":\"2026-01-01\"}}' \\\n  --update-expression 'SET version = :new' \\\n  --condition-expression 'attribute_not_exists(version)' \\\n  --expression-attribute-values '{\":new\":{\"N\":\"2\"}}'\n# run it a second time — it should be rejected",
				Check: "[ \"$(aws dynamodb get-item --table-name orders --key '{\"customerId\":{\"S\":\"c-1\"},\"orderedAt\":{\"S\":\"2026-01-01\"}}' --query 'Item.version.N' --output text 2>/dev/null)\" = \"2\" ]",
				Pass:  "The order carries `version = 2`, written under a condition.",
				Fail:  "No `version = 2` on the 2026-01-01 order yet.",
			},
			{
				ID:    "ttl",
				Title: "Let DynamoDB expire old items for you",
				Brief: "Deleting expired rows yourself costs write capacity. **TTL** deletes them in the background for free, driven by a numeric epoch-seconds attribute.\n\nEnable TTL on `orders` using the attribute `expiresAt`.",
				Hint:  "aws dynamodb update-time-to-live --table-name orders \\\n  --time-to-live-specification 'Enabled=true,AttributeName=expiresAt'",
				Check: "aws dynamodb describe-time-to-live --table-name orders --query 'TimeToLiveDescription.TimeToLiveStatus' --output text 2>/dev/null | grep -q ENABLED",
				Pass:  "TTL is enabled on `expiresAt`.",
				Fail:  "TTL isn't enabled on `orders` yet.",
			},
		},
	}
}

// queueLab teaches the parts of SQS/SNS that decide whether a system loses work:
// visibility timeouts, dead-letter redrive, and fan-out.
func queueLab() Lab {
	return Lab{
		ID:           "sqs-sns-messaging",
		Toolchain:    "AWS CLI v2 (`aws`) pointed at the floci emulator; AWS_ENDPOINT_URL and credentials are preset. Queue URLs come back as http://floci:4566/... and are reachable from here.",
		Title:        "SQS & SNS: Retries, Dead Letters & Fan-out",
		Track:        TrackCloudAPI,
		Difficulty:   Beginner,
		Minutes:      25,
		Verified:     true,
		Fidelity:     FidelityEmulated,
		FidelityNote: emulatorNote,
		Blurb:        "Send work through a real queue API. Watch a message reappear when it isn't deleted, push a poison message into a dead-letter queue, then fan one event out to several queues with SNS.",
		Concepts:     []string{"Visibility timeout", "At-least-once delivery", "Dead-letter queues", "Redrive policy", "Pub/sub fan-out"},
		Services:     []Service{fociService()},
		Workstation:  awsWorkstation(),
		Ready:        "aws sqs list-queues >/dev/null 2>&1",
		Tasks: []Task{
			{
				ID:    "create-queue",
				Title: "Create a work queue",
				Brief: "Create a queue named `jobs`. Note the URL it returns — every other call takes it as `--queue-url`.",
				Hint:  "aws sqs create-queue --queue-name jobs\nJOBS=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)",
				Check: "aws sqs get-queue-url --queue-name jobs >/dev/null 2>&1",
				Pass:  "Queue `jobs` exists.",
				Fail:  "No queue named `jobs` yet.",
			},
			{
				ID:    "send-receive",
				Title: "Send a message and receive it",
				Brief: "Send a message to `jobs`, then receive it. Receiving does **not** delete it — it hides it for the visibility timeout so one worker can process it.",
				Hint:  "JOBS=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)\naws sqs send-message --queue-url $JOBS --message-body 'resize-image-1'\naws sqs receive-message --queue-url $JOBS",
				// Counts both visible and in-flight messages: receiving one hides it
				// for the visibility timeout, so a "visible" count alone would go
				// back to zero the moment the user does the second half of the task.
				Check: `Q=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text) && V=$(aws sqs get-queue-attributes --queue-url "$Q" --attribute-names ApproximateNumberOfMessages --query Attributes.ApproximateNumberOfMessages --output text) && H=$(aws sqs get-queue-attributes --queue-url "$Q" --attribute-names ApproximateNumberOfMessagesNotVisible --query Attributes.ApproximateNumberOfMessagesNotVisible --output text) && [ $((V+H)) -ge 1 ]`,
				Pass:  "A message is in the queue.",
				Fail:  "The queue is empty — send a message.",
			},
			{
				ID:    "visibility-timeout",
				Title: "Shorten the visibility timeout",
				Brief: "If a worker dies mid-job, the message becomes visible again once the **visibility timeout** expires — that is what makes SQS at-least-once rather than at-most-once.\n\nSet the queue's `VisibilityTimeout` to **5 seconds** so a redelivery is quick to observe.",
				Hint:  "JOBS=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)\naws sqs set-queue-attributes --queue-url $JOBS --attributes VisibilityTimeout=5\n# receive without deleting, wait 5s, receive again — the same message comes back",
				Check: "[ \"$(aws sqs get-queue-attributes --queue-url \"$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)\" --attribute-names VisibilityTimeout --query 'Attributes.VisibilityTimeout' --output text 2>/dev/null)\" = \"5\" ]",
				Pass:  "Visibility timeout is 5 seconds.",
				Fail:  "`VisibilityTimeout` isn't set to 5 yet.",
			},
			{
				ID:    "dead-letter",
				Title: "Give poison messages somewhere to go",
				Brief: "A message that always fails would otherwise be retried forever. A **dead-letter queue** catches it after `maxReceiveCount` attempts so the main queue keeps flowing.\n\nCreate `jobs-dlq` and attach it to `jobs` with a redrive policy of **maxReceiveCount 2**.",
				Hint:  "aws sqs create-queue --queue-name jobs-dlq\nDLQ_ARN=$(aws sqs get-queue-attributes --queue-url $(aws sqs get-queue-url --queue-name jobs-dlq --query QueueUrl --output text) --attribute-names QueueArn --query Attributes.QueueArn --output text)\nJOBS=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)\naws sqs set-queue-attributes --queue-url $JOBS --attributes \"{\\\"RedrivePolicy\\\":\\\"{\\\\\\\"deadLetterTargetArn\\\\\\\":\\\\\\\"$DLQ_ARN\\\\\\\",\\\\\\\"maxReceiveCount\\\\\\\":\\\\\\\"2\\\\\\\"}\\\"}\"",
				Check: "aws sqs get-queue-attributes --queue-url \"$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text)\" --attribute-names RedrivePolicy --query 'Attributes.RedrivePolicy' --output text 2>/dev/null | grep -q 'jobs-dlq'",
				Pass:  "`jobs` redrives failed messages to `jobs-dlq`.",
				Fail:  "No redrive policy pointing at `jobs-dlq`.",
			},
			{
				ID:    "fanout",
				Title: "Fan one event out to many queues",
				Brief: "A queue delivers each message to **one** consumer. When several systems each need every event, publish to an **SNS topic** and subscribe the queues to it.\n\nCreate a topic `order-events`, create a second queue `audit`, and subscribe `audit` to the topic.",
				Hint:  "aws sns create-topic --name order-events\naws sqs create-queue --queue-name audit\nTOPIC=$(aws sns create-topic --name order-events --query TopicArn --output text)\nAUDIT_ARN=$(aws sqs get-queue-attributes --queue-url $(aws sqs get-queue-url --queue-name audit --query QueueUrl --output text) --attribute-names QueueArn --query Attributes.QueueArn --output text)\naws sns subscribe --topic-arn $TOPIC --protocol sqs --notification-endpoint $AUDIT_ARN",
				Check: "aws sns list-subscriptions --query 'Subscriptions[].Endpoint' --output text 2>/dev/null | grep -q audit",
				Pass:  "Queue `audit` is subscribed to the `order-events` topic.",
				Fail:  "No SQS subscription for the `audit` queue yet.",
			},
		},
	}
}

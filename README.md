# Pulumi AWS Infrastructure as Code

This repository contains a Pulumi program written in JavaScript for creating AWS infrastructure resources, including a Virtual Private Cloud (VPC), subnets, route tables, an Internet Gateway, and more. The infrastructure is defined and provisioned as code.

## Prerequisites

Before running the Pulumi program, make sure you have the following prerequisites:

1. [Node.js](https://nodejs.org/) installed.
2. [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) installed.
3. AWS credentials configured with the necessary permissions.

## Configuration

The Pulumi program uses a `Pulumi.dev.yaml` file to configure the AWS resources. Update the file with the desired values:

```yaml
config:
  aws:profile: dev
  aws:region: us-east-1
  iac-pulumi:vpcCidrBlock: 10.0.0.0/16
  iac-pulumi:destinationCidrBlock: 0.0.0.0/0

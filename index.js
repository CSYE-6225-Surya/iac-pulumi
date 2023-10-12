"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const SubnetCIDRAdviser = require('subnet-cidr-calculator');

const vpcName = "csye-6225"; // Your custom VPC name
const config = new pulumi.Config("iac-pulumi");

const vpcCidrBlock = config.require("vpcCidrBlock");
const destinationCidrBlock = config.require("destinationCidrBlock");

async function main() {

    const probabal_subnets = SubnetCIDRAdviser.calculate(vpcCidrBlock.split('/')[0], vpcCidrBlock.split('/')[1]);
    try {
        // Create VPC
        const vpc = new aws.ec2.Vpc('my-vpc', {
            cidrBlock: vpcCidrBlock,
            tags: {
                Name: vpcName,
            },
        });

        exports.vpcId = vpc.id;

        // Get available availability zones in the current region
        const availabilityZones = await aws.getAvailabilityZones({ state: "available" });

        const publicSubnets = [];
        const privateSubnets = [];

        for (let i = 0; i < availabilityZones.names.length; i++) {
            // Subnets
            if (i === 3) {
                break;
            }
            const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
                vpcId: vpc.id,
                cidrBlock: probabal_subnets.subnets[i].value, // Adjust the CIDR blocks as needed
                availabilityZone: availabilityZones.names[i],
                mapPublicIpOnLaunch: true,
                tags: {
                    Name: `PublicSubnet${i}`,
                },
            });
            publicSubnets.push(publicSubnet);
            const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
                vpcId: vpc.id,
                cidrBlock: probabal_subnets.subnets[i + 3].value, // Adjust the CIDR blocks as needed
                availabilityZone: availabilityZones.names[i],
                tags: {
                    Name: `PrivateSubnet${i}`,
                },
            });
            privateSubnets.push(privateSubnet);
        }

        // Create a Public Route Table
        const publicRouteTable = new aws.ec2.RouteTable('public-route-table', {
            vpcId: vpc.id,
            tags: {
                Name: 'PublicRouteTable',
            },
        });

        // Associate Public Subnets with the Public Route Table
        for (let i = 0; i < publicSubnets.length; i++) {
            const subnetAssociation = new aws.ec2.RouteTableAssociation(`public-subnet-association-${i}`, {
                subnetId: publicSubnets[i].id,
                routeTableId: publicRouteTable.id,
            });
        }

        // Create a Public Route for Internet Gateway
        const igw = new aws.ec2.InternetGateway('my-igw', {
            tags: {
                Name: 'my-igw-tag', // Your custom name for the Internet Gateway
            },
        });

        // Attach Internet Gateway to VPC
        const igwAttachment = new aws.ec2.InternetGatewayAttachment('my-igw-attachment', {
            vpcId: vpc.id, // Use the VPC ID created earlier
            internetGatewayId: igw.id,
        });

        const publicRoute = new aws.ec2.Route('public-route', {
            routeTableId: publicRouteTable.id,
            destinationCidrBlock: destinationCidrBlock,
            gatewayId: igw.id, // Use the Internet Gateway ID created earlier
        });

        exports.publicRouteTableId = publicRouteTable.id;
        exports.internetGatewayId = igw.id;

        // Create a Private Route Table
        const privateRouteTable = new aws.ec2.RouteTable('private-route-table', {
            vpcId: vpc.id,
            tags: {
                Name: 'PrivateRouteTable',
            },
        });

        // Associate Private Subnets with the Private Route Table
        for (let i = 0; i < privateSubnets.length; i++) {
            const subnetAssociation = new aws.ec2.RouteTableAssociation(`private-subnet-association-${i}`, {
                subnetId: privateSubnets[i].id,
                routeTableId: privateRouteTable.id,
            });
        }

        exports.privateRouteTableId = privateRouteTable.id;

    } catch (error) {
        console.error("Error creating resources:", error);
        exports.error = error;
    }
}

main();

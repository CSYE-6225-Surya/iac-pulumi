"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const SubnetCIDRAdviser = require('subnet-cidr-calculator');

const vpcName = "csye-6225"; // Your custom VPC name
const config = new pulumi.Config("iac-pulumi");

const vpcCidrBlock = config.require("vpcCidrBlock");
const destinationCidrBlock = config.require("destinationCidrBlock");
const amiId = config.require("amiId");
const instanceType = config.require("instanceType");
const keyName = config.require("keyName");
const volumeSize = config.require("volumeSize");
const volumeType = config.require("volumeType");
const ingressPorts = JSON.parse(config.require("ingressPorts"));

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
        let ingressArray = [];
        for (let i = 0; i < ingressPorts.length; i++) {
            let obj = {
                description: "Rules",
                fromPort: 0,
                toPort: 0,
                protocol: "tcp",
                cidrBlocks: [destinationCidrBlock],
            };
            obj.fromPort = parseInt(ingressPorts[i]);
            obj.toPort = parseInt(ingressPorts[i]);
            ingressArray.push(obj);
            obj = {};
        }
        // Create an EC2 security group
        const appSecurityGroup = new aws.ec2.SecurityGroup("application security group", {
            description: "Security group for web application EC2 instances",
            vpcId: vpc.id, // Replace with your VPC ID
            ingress: ingressArray,
        });

        // Create an EC2 instance associated with the security group
        const ec2Instance = new aws.ec2.Instance("myInstance", {
            ami: amiId, // Replace with your custom AMI ID
            instanceType: instanceType, // Replace with your desired instance type
            securityGroups: [appSecurityGroup.id], // Associate the security group with the instance
            keyName: keyName,
            tags: {
                Name: "MyEC2Instance", // Replace with a meaningful name
            },
            rootBlockDevice: {
                volumeSize: volumeSize,
                volumeType: volumeType,
                deleteOnTermination: true,
            },
            creditSpecification: {
                cpuCredits: "standard",
            },
            disableApiTermination: false,
            ebsOptimized: false,
            instanceInitiatedShutdownBehavior: "stop",
            subnetId: publicSubnets[0].id, // Replace with the ID of the subnet in your VPC
        });

        // Export the security group ID and instance ID
        exports.appSecurityGroupId = appSecurityGroup.id;
        exports.instanceId = ec2Instance.id;


    } catch (error) {
        console.error("Error creating resources:", error);
        exports.error = error;
    }
}

main();

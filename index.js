"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const SubnetCIDRAdviser = require('subnet-cidr-calculator');

const vpcName = "csye-6225"; // Your custom VPC name
const config = new pulumi.Config("iac-pulumi");

const vpcCidrBlock = config.require("vpcCidrBlock");
const destinationCidrBlock = config.require("destinationCidrBlock");
const desiredSubnetCount = config.require("desiredSubnetCount");
const amiId = config.require("amiId");
const instanceType = config.require("instanceType");
const keyName = config.require("keyName");
const volumeSize = config.require("volumeSize");
const volumeType = config.require("volumeType");
const dbPort = config.require("dbPort");
const dbFamily = config.require("dbFamily");
const ingressPorts = JSON.parse(config.require("ingressPorts"));
const loadBalancerIngressPorts = JSON.parse(config.require("loadBalancerIngressPorts"));
const dbAllocatedStorage = config.require("dbAllocatedStorage");
const dbBackupRetentionPeriod = config.require("dbBackupRetentionPeriod");
const dbInstanceIndentifier = config.require("dbInstanceIndentifier");
const dbEngine = config.require("dbEngine");
const dbEngineVersion = config.require("dbEngineVersion");
const dbInstanceClass = config.require("dbInstanceClass");
const dbMultiAz = config.require("dbMultiAz");
const dbName = config.require("dbName");
const dbPassword = config.require("dbPassword");
const dbSkipFinalSnapshot = config.require("dbSkipFinalSnapshot");
const dbUsername = config.require("dbUsername");
const dbPubliclyAccessible = config.require("dbPubliclyAccessible");
const dbStorageType = config.require("dbStorageType");
const devAccountId = config.require("devAccountId");
const demoAccountId = config.require("demoAccountId");
const dnsRecordName = config.require("dnsRecordName");
const loadBalancerEgressPort = config.require("loadBalancerEgressPort");
const targetGroupPort = config.require("targetGroupPort");
const targetGroupProtocol = config.require("targetGroupProtocol");
const targetGroupType = config.require("targetGroupType");
const targetGroupUnHealthyThreshold = config.require("targetGroupUnHealthyThreshold");
const targetGroupHealthyThreshold = config.require("targetGroupHealthyThreshold");
const targetGroupInterval = config.require("targetGroupInterval");
const targetGroupTimeout = config.require("targetGroupTimeout");
const targetGroupPath = config.require("targetGroupPath");
const listenerGroupPort = config.require("listenerGroupPort");
const listenerGroupProtocol = config.require("listenerGroupProtocol");
const deviceName = config.require("deviceName");
const autoScaleDesiredCapacity = config.require("autoScaleDesiredCapacity");
const autoScaleMinSize = config.require("autoScaleMinSize");
const autoScaleMaxSize = config.require("autoScaleMaxSize");
const autoScaleCoolDown = config.require("autoScaleCoolDown");
const metricAlarmScaleUpComparisonOperator = config.require("metricAlarmScaleUpComparisonOperator");
const metricAlarmScaleDownComparisonOperator = config.require("metricAlarmScaleDownComparisonOperator");
const metricAlarmMetricName = config.require("metricAlarmMetricName");
const metricAlarmNamespace = config.require("metricAlarmNamespace");
const metricAlarmStaistic = config.require("metricAlarmStaistic");
const metricAlarmThreshold = config.require("metricAlarmThreshold");
const metricAlarmEvaluationPeriods = config.require("metricAlarmEvaluationPeriods");
const metricAlarmPeriod = config.require("metricAlarmPeriod");

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
            if (i === parseInt(desiredSubnetCount)) {
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

        const dbSubnetGroup = new aws.rds.SubnetGroup("my-db-subnet-group", {
            name: "my-db-subnet-group",
            subnetIds: privateSubnets.map(subnet => subnet.id), // Replace with your subnet IDs
        });

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

        let loadBalancerIngressArray = [];
        for (let i = 0; i < loadBalancerIngressPorts.length; i++) {
            let obj = {
                description: "Rules",
                fromPort: 0,
                toPort: 0,
                protocol: "tcp",
                cidrBlocks: [destinationCidrBlock],
            };
            obj.fromPort = parseInt(loadBalancerIngressPorts[i]);
            obj.toPort = parseInt(loadBalancerIngressPorts[i]);
            loadBalancerIngressArray.push(obj);
            obj = {};
        }

        const lbSecurityGroup = new aws.ec2.SecurityGroup("load balancer security group", {
            description: "Security group for load balancer",
            vpcId: vpc.id, // Replace with your VPC ID
            ingress: loadBalancerIngressArray,
            egress: [
                {
                    cidrBlocks: [destinationCidrBlock],
                    protocol: "tcp",
                    fromPort: parseInt(loadBalancerEgressPort),
                    toPort: parseInt(loadBalancerEgressPort),
                }
            ],
        });
        let ingressArray = [];
        for (let i = 0; i < ingressPorts.length; i++) {
            let obj = {
                description: "Rules",
                fromPort: 0,
                toPort: 0,
                protocol: "tcp",
                cidrBlocks: [destinationCidrBlock],
                securityGroups: [lbSecurityGroup.id]
            };
            obj.fromPort = parseInt(ingressPorts[i]);
            obj.toPort = parseInt(ingressPorts[i]);
            if (parseInt(ingressPorts[i]) === 3000) {
                delete obj.cidrBlocks;
            }
            ingressArray.push(obj);
            obj = {};
        }
        // Create an EC2 security group
        const appSecurityGroup = new aws.ec2.SecurityGroup("application security group", {
            description: "Security group for web application EC2 instances",
            vpcId: vpc.id, // Replace with your VPC ID
            ingress: ingressArray,
            egress: [
                {
                    cidrBlocks: [destinationCidrBlock],
                    protocol: "-1",
                    fromPort: 0,
                    toPort: 0,
                }
            ],

        }, { dependsOn: lbSecurityGroup });


        const databaseSecurityGroup = new aws.ec2.SecurityGroup("database security group", {
            description: "Security group for RDS instances",
            vpcId: vpc.id,
            ingress: [
                {
                    description: "DB Rule",
                    fromPort: dbPort,
                    toPort: dbPort,
                    protocol: "tcp",
                    securityGroups: [appSecurityGroup.id],
                }
            ],
        }, { dependsOn: appSecurityGroup });

        const dbParameterGroup = new aws.rds.ParameterGroup("my-db-parameter-group", {
            family: dbFamily, // Replace with the appropriate PostgreSQL family
            description: "My custom PostgreSQL DB parameter group",
            parameters: [
            ],
        });

        exports.dbParameterGroupName = dbParameterGroup.name;

        // Define the RDS instance
        const rdsInstance = new aws.rds.Instance("csye6225-rds-instance", {
            allocatedStorage: dbAllocatedStorage, // Storage in GB (gp3 type)
            backupRetentionPeriod: dbBackupRetentionPeriod,
            dbInstanceIdentifier: dbInstanceIndentifier,
            engine: dbEngine, // PostgreSQL database engine
            engineVersion: parseInt(dbEngineVersion), // Replace with the PostgreSQL version you want
            instanceClass: dbInstanceClass, // Choose an appropriate instance class
            multiAz: dbMultiAz,
            name: dbName,
            password: dbPassword, // Replace with your password
            skipFinalSnapshot: dbSkipFinalSnapshot,
            username: dbUsername,
            publiclyAccessible: dbPubliclyAccessible, // No public accessibility
            dbSubnetGroupName: dbSubnetGroup, // Replace with your subnet group name
            vpcSecurityGroupIds: [databaseSecurityGroup.id], // Replace with your security group ID
            parameterGroupName: dbParameterGroup.name, // Replace with your parameter group name
            storageType: dbStorageType,
            tags: {
                Name: "csye6225-rds-instance",
            },
        }, { dependsOn: dbSubnetGroup });

        const userDataScript = pulumi.all([rdsInstance.dbName, rdsInstance.username, rdsInstance.password, rdsInstance.address]).apply(([dbname, dbusername, dbpassword, dbhost]) => {
            return `#!/bin/bash
            echo "DB_NAME=${dbname}" >> /opt/webapp/.env
            echo "DB_USER=${dbusername}" >> /opt/webapp/.env
            echo "DB_PASSWORD=${dbpassword}" >> /opt/webapp/.env
            echo "DB_HOST=${dbhost}" >> /opt/webapp/.env
            echo "DB_PORT=${dbPort}" >> /opt/webapp/.env
            cd /opt/webapp
            node changeConfig.js
            npm run migrate
            cd src
            mkdir logs
            cd logs
            touch log-file.log
            sudo chown csye6225user:csye6225group log-file.log
            sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
                -a fetch-config \
                -m ec2 \
                -c file:/opt/webapp/src/config/cloudwatch-config.json \
                -s
            sudo service amazon-cloudwatch-agent restart
            sudo systemctl enable webapp.service
            sudo systemctl start webapp.service
            `;
        });

        // First we'll create a role for our Ec2 instance
        const cloudWatchAgentServerRole = new aws.iam.Role("cloudWatchAgentServerRole", {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Principal: { Service: "ec2.amazonaws.com" },
                        Effect: "Allow"
                    }
                ]
            }),
            description: "Role for allowing CloudWatch Agent to send metrics/logs to CloudWatch",
            name: "CloudWatchAgentServerRole"
        });

        // We attach the existing policy CloudWatchAgentServerPolicy to the role
        const cloudWatchPolicyAttachment = new aws.iam.RolePolicyAttachment("cloudWatchPolicyAttachment", {
            role: cloudWatchAgentServerRole.name,
            policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
        }, { dependsOn: cloudWatchAgentServerRole });

        const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", {
            role: cloudWatchAgentServerRole.name
        }, { dependsOn: cloudWatchAgentServerRole });

        const latestAmi = await aws.ec2.getAmi({
            mostRecent: true,
            owners: [devAccountId, demoAccountId],
        })

        const encodedUserData = userDataScript.apply(script => Buffer.from(script).toString('base64'));

        // Create a Load Balancer
        const loadBalancer = new aws.lb.LoadBalancer("loadBalancer", {
            internal: false,
            securityGroups: [lbSecurityGroup.id],
            subnets: publicSubnets.map(subnet => subnet.id),
        }, { dependsOn: lbSecurityGroup });

        // Define the HTTP target group
        const httpTargetGroup = new aws.lb.TargetGroup("httpTargetGroup", {
            port: parseInt(targetGroupPort),
            protocol: targetGroupProtocol,
            vpcId: vpc.id,
            targetType: targetGroupType,
            healthCheck: {
                enabled: true,
                unhealthyThreshold: parseInt(targetGroupUnHealthyThreshold),
                healthyThreshold: parseInt(targetGroupHealthyThreshold),
                interval: parseInt(targetGroupInterval),
                timeout: parseInt(targetGroupTimeout),
                path: targetGroupPath,
                port: parseInt(targetGroupPort),
                protocol: targetGroupProtocol
            },
        }, { dependsOn: loadBalancer });

        // Listener for the Load Balancer
        const httpListener = new aws.lb.Listener("httpListener", {
            loadBalancerArn: loadBalancer.arn,
            port: parseInt(listenerGroupPort),
            protocol: listenerGroupProtocol,
            defaultActions: [{
                type: "forward",
                targetGroupArn: httpTargetGroup.arn
            }],
        }, { dependsOn: [loadBalancer, httpTargetGroup] });

        const launchTemplate = new aws.ec2.LaunchTemplate("asg_launch_config", {
            imageId: latestAmi.id || amiId,
            instanceType: instanceType,
            keyName: keyName,
            tags: {
                Name: "MyEC2LaunchTemplate", // Replace with a meaningful name
            },
            blockDeviceMappings: [
                {
                    deviceName: deviceName,
                    ebs: {
                        volumeSize: volumeSize,
                        volumeType: volumeType,
                        deleteOnTermination: true
                    }
                }
            ],
            creditSpecification: {
                cpuCredits: "standard",
            },
            disableApiTermination: false,
            ebsOptimized: false,
            instanceInitiatedShutdownBehavior: "stop",

            iamInstanceProfile: { name: instanceProfile.name },
            // vpcSecurityGroupIds: [appSecurityGroup.id],
            userData: encodedUserData,
            networkInterfaces: [{
                associatePublicIpAddress: true,
                securityGroups: [appSecurityGroup.id]
            }],
        }, { dependsOn: [rdsInstance, databaseSecurityGroup, cloudWatchPolicyAttachment, instanceProfile] });

        const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
            desiredCapacity: parseInt(autoScaleDesiredCapacity),
            minSize: parseInt(autoScaleMinSize),
            maxSize: parseInt(autoScaleMaxSize),
            launchTemplate: {
                id: launchTemplate.id,
                version: launchTemplate.latestVersion,
            },
            targetGroupArns: [httpTargetGroup.arn],
            vpcZoneIdentifiers: publicSubnets,
            tags: [
                {
                    key: "AutoScalingGroup",
                    value: "TargetProperty",
                    propagateAtLaunch: true,
                },
            ]

        }, { dependsOn: [launchTemplate, httpTargetGroup, loadBalancer] });

        // Define scale up policy
        const scaleUpPolicy = new aws.autoscaling.Policy("scaleUp", {
            adjustmentType: "ChangeInCapacity",
            scalingAdjustment: 1,
            cooldown: parseInt(autoScaleCoolDown),  // seconds
            autoscalingGroupName: autoScalingGroup.name,
        }, { dependsOn: autoScalingGroup });

        // Attach an alarm that triggers the policy
        new aws.cloudwatch.MetricAlarm("cpuHigh", {
            alarmActions: [scaleUpPolicy.arn],
            comparisonOperator: metricAlarmScaleUpComparisonOperator,
            evaluationPeriods: metricAlarmEvaluationPeriods,
            metricName: metricAlarmMetricName,
            namespace: metricAlarmNamespace,
            period: metricAlarmPeriod,
            statistic: metricAlarmStaistic,
            threshold: metricAlarmThreshold,
            alarmDescription: "This metric checks cpu utilization",
            alarmName: "cpuHigh",
            dimensions: {
                AutoScalingGroupName: autoScalingGroup.name,
            }
        }, { dependsOn: [scaleUpPolicy, autoScalingGroup] });

        // Define scale down policy
        const scaleDownPolicy = new aws.autoscaling.Policy("scaleDown", {
            adjustmentType: "ChangeInCapacity",
            scalingAdjustment: -1,
            cooldown: parseInt(autoScaleCoolDown),  // seconds
            autoscalingGroupName: autoScalingGroup.name,
        }, { dependsOn: autoScalingGroup });

        // Attach an alarm that triggers the policy
        new aws.cloudwatch.MetricAlarm("cpuLow", {
            alarmActions: [scaleDownPolicy.arn],
            comparisonOperator: metricAlarmScaleDownComparisonOperator,
            evaluationPeriods: metricAlarmEvaluationPeriods,
            metricName: metricAlarmMetricName,
            namespace: metricAlarmNamespace,
            period: metricAlarmPeriod,
            statistic: metricAlarmStaistic,
            threshold: metricAlarmThreshold,
            alarmDescription: "This metric checks cpu utilization",
            alarmName: "cpuLow",
            dimensions: {
                AutoScalingGroupName: autoScalingGroup.name,
            },
        }, { dependsOn: [scaleDownPolicy, autoScalingGroup] });

        // Export the security group ID and instance ID
        exports.appSecurityGroupId = appSecurityGroup.id;
        exports.databaseSecurityGroupId = databaseSecurityGroup.id;
        // exports.instanceId = ec2Instance.id;

        // Create a DNS record for the web server
        const dnsRecord = new aws.route53.Record("my-instance-dns", {
            name: dnsRecordName,    // Replace with your domain name
            type: "A",
            // records: [ec2Instance.publicIp],
            // ttl: 300,
            zoneId: (await aws.route53.getZone({ name: dnsRecordName })).zoneId,
            aliases: [
                {
                    evaluateTargetHealth: true,
                    name: loadBalancer.dnsName,
                    zoneId: loadBalancer.zoneId
                }
            ]  // Replace with your domain Id
        }, { dependsOn: loadBalancer });

        exports.dnsRecord = dnsRecord;
        const logGroup = new aws.cloudwatch.LogGroup("csye6225LogGroup", {
            name: "csye6225",
        });

        const logStream = new aws.cloudwatch.LogStream("WebappLogStream", {
            name: "webapp",
            logGroupName: logGroup.name,
        }, { dependsOn: logGroup });


    } catch (error) {
        console.error("Error creating resources:", error);
        exports.error = error;
    }
}

main();

/**
 * `labsim-lab/orchestrator` — Orca, the on-prem Spring Boot monolith scaffolded with JHipster
 * (Ref §1, §3): `.jhipster/*.json` entity definitions, Liquibase changelogs + CSV seeds (MySQL schema
 * `orca`), the xy_touch / checkout / card REST resources, the 5-minute health-check scheduler and Tate's
 * Angular robot-list filter UI. Planned migration: Docker + GCP (draft PR #81).
 */
import type { RepoSeed } from './types';

const entity = (name: string, table: string, fields: [string, string, string?][], rel: string[] = [], changelog = '20260309101500'): string =>
  `${JSON.stringify(
    {
      applications: ['orca'],
      changelogDate: changelog,
      dto: 'no',
      entityTableName: table,
      fields: fields.map(([fieldName, fieldType, extra]) => ({
        fieldName,
        fieldType,
        ...(extra === 'required' ? { fieldValidateRules: ['required'] } : {}),
        ...(extra && extra !== 'required' ? { fieldValues: extra } : {}),
      })),
      jpaMetamodelFiltering: true,
      name,
      pagination: 'pagination',
      readOnly: false,
      relationships: rel.map((r) => {
        const [relationshipName, otherEntityName, relationshipType] = r.split(':');
        return { otherEntityName, relationshipName, relationshipType };
      }),
      searchEngine: 'no',
      service: 'serviceClass',
    },
    null,
    2,
  )}\n`;

export const DEVICE_TYPE_JAVA = `package com.labsim.orca.domain.enumeration;

/** The DeviceType enumeration. ALL CAPS — Jenkins env vars must match exactly. */
public enum DeviceType {
    STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3,
    MINI_2, MINI_3, MINI_4,
    FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET,
    COMPACT
}
`;

const DEVICE_TYPES = 'STATION_2018,STATION_2,STATION_DUO,STATION_DUO_2,STATION_DUO_3,MINI_2,MINI_3,MINI_4,FLEX_1,FLEX_2,FLEX_3,FLEX_4,FLEX_POCKET,COMPACT';

const JHIPSTER: Record<string, string> = {
  '.jhipster/Robot.json': entity(
    'Robot',
    'robot',
    [
      ['name', 'String', 'required'],
      ['humanReadableName', 'String', 'required'],
      ['status', 'RobotStatus', 'AVAILABLE,UNAVAILABLE,OFFLINE,CONNECTION_FAILED,RESERVED'],
      ['environment', 'String'],
      ['adbServiceUrl', 'String'],
      ['cameraStreamUrl', 'String'],
      ['dipUrl', 'String'],
      ['tapUrl', 'String'],
      ['swipeUrl', 'String'],
      ['offsetX', 'Double'],
      ['offsetY', 'Double'],
      ['reservedBy', 'String'],
      ['notes', 'TextBlob'],
    ],
    ['device:Device:many-to-one', 'mfdDevice:Device:many-to-one', 'cfdDevice:Device:many-to-one', 'capabilities:RobotCapability:many-to-many', 'merchantConfig:MerchantConfig:many-to-one'],
    '20260309101500',
  ),
  '.jhipster/Device.json': entity('Device', 'device', [['name', 'String', 'required'], ['deviceType', 'DeviceType', DEVICE_TYPES], ['serial', 'String', 'required'], ['ip', 'String'], ['label', 'String'], ['retired', 'Boolean']], [], '20260309101600'),
  '.jhipster/RobotCapability.json': entity('RobotCapability', 'robot_capability', [['name', 'String', 'required'], ['description', 'String'], ['lookup', 'CapabilityLookup', 'DYNAMIC_JSON,NON_DYNAMIC,BOTH'], ['json', 'String']], [], '20260309101700'),
  '.jhipster/MerchantConfig.json': entity(
    'MerchantConfig',
    'merchant_config',
    [
      ['name', 'String', 'required'],
      ['merchantId', 'String', 'required'],
      ['environment', 'String'],
      ['country', 'String'],
      ['currency', 'String'],
      ['taxRateBp', 'Integer'],
      ['tipsEnabled', 'Boolean'],
      ['pinBypass', 'Boolean'],
      ['cashDiscountEnabled', 'Boolean'],
      ['owner', 'String'],
      ['ubiRoute', 'String'],
      ['appId', 'String'],
      ['appSecret', 'String'],
      ['apiKey', 'String'],
    ],
    [],
    '20260309101800',
  ),
  '.jhipster/Screen.json': entity('Screen', 'screen', [['name', 'String', 'required'], ['deviceType', 'DeviceType', DEVICE_TYPES], ['description', 'String'], ['optionCount', 'Integer']], [], '20260309101900'),
  '.jhipster/ScreenLocation.json': entity('ScreenLocation', 'screen_location', [['button', 'String', 'required'], ['xMm', 'Double', 'required'], ['yMm', 'Double', 'required']], ['screen:Screen:many-to-one'], '20260309102000'),
  '.jhipster/CardProfile.json': entity('CardProfile', 'card_profile', [['name', 'String', 'required'], ['brand', 'String'], ['entry', 'CardEntry', 'SWIPE,DIP,TAP'], ['trackData', 'TextBlob'], ['gortPath', 'String'], ['country', 'String'], ['owner', 'String']], [], '20260309102100'),
  '.jhipster/ScreenCompareImage.json': entity('ScreenCompareImage', 'screen_compare_image', [['name', 'String', 'required'], ['screenName', 'String'], ['x', 'Integer'], ['y', 'Integer'], ['w', 'Integer'], ['h', 'Integer'], ['expectedText', 'String', 'required'], ['deprecated', 'Boolean']], ['robot:Robot:many-to-one'], '20260412093000'),
};

const YO_RC = `{
  "generator-jhipster": {
    "applicationType": "monolith",
    "authenticationType": "jwt",
    "baseName": "orca",
    "buildTool": "maven",
    "cacheProvider": "ehcache",
    "clientFramework": "angular",
    "databaseType": "sql",
    "devDatabaseType": "mysql",
    "prodDatabaseType": "mysql",
    "enableHibernateCache": true,
    "entities": ["Robot", "Device", "RobotCapability", "MerchantConfig", "Screen", "ScreenLocation", "CardProfile", "ScreenCompareImage"],
    "jhipsterVersion": "8.1.0",
    "packageName": "com.labsim.orca",
    "serverPort": "8080"
  }
}
`;

const README = `# Orchestrator (Orca)

On-prem Spring Boot monolith generated with **JHipster** (interactive questionnaire → Angular UI, Spring Boot
REST endpoints, MySQL schema). Orca is the **Controller**; Jenkins is the **Executor**.

* MySQL schema \`orca\` on \`orca.lab.local:3306\`. Entities (\`.jhipster/\`): Robot, Device, RobotCapability,
  MerchantConfig, Screen, ScreenLocation, CardProfile, ScreenCompareImage.
* Every 5 minutes \`HealthCheckScheduler\` pings each Robot Pi's \`GET /health\`; a timeout or non-200 sets
  \`CONNECTION_FAILED\`, blocks checkouts and writes a Note with the endpoint and error. OFFLINE robots are
  skipped; RESERVED robots are never overridden.
* \`POST /api/xy_touch {"robot","screen","button"}\` looks up the Screen Location (mm from the top-left) for the
  robot's Device Type and tells the Pi to fire an ADB touch (ADB bots) or a physical probe tap (touch rigs).
* \`POST /api/robots/checkout\` matches capabilities (non-dynamic from the pipeline + dynamic JSON from the test).
  \`deviceType\` goes through \`DeviceType.valueOf\` — values are ALL CAPS.

## Run
\`\`\`
./mvnw -Pdev           # needs MySQL (src/main/docker/mysql.yml)
\`\`\`

Roadmap: containerise with Docker and move to GCP (Cloud SQL) — see the draft PR.
`;

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>tech.jhipster</groupId>
        <artifactId>jhipster-dependencies</artifactId>
        <version>8.1.0</version>
    </parent>
    <groupId>com.labsim.orca</groupId>
    <artifactId>orca</artifactId>
    <version>3.7.2</version>
    <packaging>jar</packaging>
    <name>Orca (Orchestrator)</name>
    <properties>
        <java.version>17</java.version>
        <liquibase.version>4.25.1</liquibase.version>
    </properties>
    <dependencies>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>
        <dependency><groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId></dependency>
        <dependency><groupId>org.liquibase</groupId><artifactId>liquibase-core</artifactId></dependency>
        <dependency><groupId>tech.jhipster</groupId><artifactId>jhipster-framework</artifactId></dependency>
    </dependencies>
</project>
`;

const APP_JAVA = `package com.labsim.orca;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class OrcaApp {

    public static void main(String[] args) {
        SpringApplication.run(OrcaApp.class, args);
    }
}
`;

const ROBOT_STATUS = `package com.labsim.orca.domain.enumeration;

/** The RobotStatus enumeration. CONNECTION_FAILED is set by the health check only. */
public enum RobotStatus {
    AVAILABLE, UNAVAILABLE, OFFLINE, CONNECTION_FAILED, RESERVED
}
`;

const CAPABILITY_LOOKUP = `package com.labsim.orca.domain.enumeration;

/** NON_DYNAMIC = hard-coded in the pipeline script (UI Automator suites); DYNAMIC_JSON = parsed from the test definition (SDK frameworks). */
public enum CapabilityLookup {
    DYNAMIC_JSON, NON_DYNAMIC, BOTH
}
`;

const MERCHANT_V1 = `package com.labsim.orca.domain;

import jakarta.persistence.*;
import java.io.Serializable;

/** Merchant account parameters. The list table cannot show every column — use Edit. */
@Entity
@Table(name = "merchant_config")
public class MerchantConfig implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, unique = true)
    private String name;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "environment")
    private String environment;

    @Column(name = "tax_rate_bp")
    private Integer taxRateBp;

    @Column(name = "pin_bypass")
    private Boolean pinBypass;

    @Column(name = "cash_discount_enabled")
    private Boolean cashDiscountEnabled;

    /** Ubi platform route used by Laz merchant switches. */
    @Column(name = "ubi_route")
    private String ubiRoute;

    public String getName() {
        return name;
    }

    public Boolean getPinBypass() {
        return pinBypass;
    }

    public String getUbiRoute() {
        return ubiRoute;
    }
}
`;

const MERCHANT = MERCHANT_V1.replace(
  `    public String getName() {`,
  `    /** Go SDK credentials (Tate, #77): exported by Jenkins as APP_ID / APP_SECRET / API_KEY. */
    @Column(name = "app_id")
    private String appId;

    @Column(name = "app_secret")
    private String appSecret;

    @Column(name = "api_key")
    private String apiKey;

    public String getAppId() {
        return appId;
    }

    public String getAppSecret() {
        return appSecret;
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getName() {`,
);

const HEALTH = `package com.labsim.orca.service;

import com.labsim.orca.domain.Robot;
import com.labsim.orca.domain.enumeration.RobotStatus;
import com.labsim.orca.repository.RobotRepository;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * The 5-minute synchronized background thread: pings every Robot Pi's Robot Controller.
 * Non-200 or no response → CONNECTION_FAILED (blocks checkouts) + a Note with the exact endpoint and error.
 * OFFLINE robots are skipped. RESERVED robots are pinged but never overridden.
 */
@Service
public class HealthCheckScheduler {

    private static final Logger log = LoggerFactory.getLogger(HealthCheckScheduler.class);
    private static final Duration TIMEOUT = Duration.ofMillis(10_000);

    private final RobotRepository robots;
    private final RestTemplate http;
    private final NoteService notes;

    public HealthCheckScheduler(RobotRepository robots, RestTemplate http, NoteService notes) {
        this.robots = robots;
        this.http = http;
        this.notes = notes;
    }

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public synchronized void run() {
        for (Robot robot : robots.findAll()) {
            if (robot.getStatus() == RobotStatus.OFFLINE) {
                continue;
            }
            String endpoint = robot.piBaseUrl() + "/health";
            String error = null;
            try {
                var res = http.getForEntity(endpoint, String.class);
                if (res.getStatusCode().value() != 200) {
                    error = res.getStatusCode().value() + " " + res.getBody();
                }
            } catch (RestClientException e) {
                error = describe(e);
            }
            if (robot.getStatus() == RobotStatus.RESERVED) {
                continue; // Reserved blocks health-check overrides
            }
            if (error != null && robot.getStatus() != RobotStatus.CONNECTION_FAILED) {
                robot.setPreFailureStatus(robot.getStatus());
                robot.setStatus(RobotStatus.CONNECTION_FAILED);
                notes.health(robot, endpoint, error);
                log.warn("{} → Connection Failed ({} → {})", robot.getName(), endpoint, error);
            } else if (error == null && robot.getStatus() == RobotStatus.CONNECTION_FAILED) {
                robot.setStatus(robot.getPreFailureStatus() != null ? robot.getPreFailureStatus() : RobotStatus.AVAILABLE);
                notes.recovered(robot, endpoint);
            }
        }
    }

    private static String describe(RestClientException e) {
        String m = String.valueOf(e.getMessage());
        if (m.contains("Read timed out") || m.contains("connect timed out")) {
            return "connect timed out after " + TIMEOUT.toMillis() + " ms";
        }
        return m.contains("Connection refused") ? "Connection refused" : m;
    }
}
`;

const XY_SERVICE = `package com.labsim.orca.service;

import com.labsim.orca.domain.Robot;
import com.labsim.orca.domain.Screen;
import com.labsim.orca.domain.ScreenLocation;
import com.labsim.orca.repository.ScreenLocationRepository;
import com.labsim.orca.repository.ScreenRepository;
import com.labsim.orca.web.rest.errors.BadRequestAlertException;
import org.springframework.stereotype.Service;

/**
 * xy_touch: look up the Screen Location (mm from the screen's top-left (0,0)) for the robot's Device Type and
 * tell the Robot Pi to fire an ADB touch (ADB bots) or a physical solenoid tap (touch robots).
 * Orca answers 200 OK whether or not the probe actually hit the button.
 */
@Service
public class XyTouchService {

    private final ScreenRepository screens;
    private final ScreenLocationRepository locations;
    private final PiClient pi;

    public XyTouchService(ScreenRepository screens, ScreenLocationRepository locations, PiClient pi) {
        this.screens = screens;
        this.locations = locations;
        this.pi = pi;
    }

    public XyTouchResult touch(Robot robot, String screenName, String button) {
        var type = robot.getDevice().getDeviceType();
        Screen screen = screens.findOneByDeviceTypeAndName(type, screenName)
            .orElseThrow(() -> new NotFoundException("no Screen " + screenName + " for " + type));
        ScreenLocation loc = locations.findOneByScreenAndButton(screen, button)
            .orElseThrow(() -> new NotFoundException("no Screen Location for (" + type + ", " + screenName + ", \\"" + button + "\\")"));
        // Offsets are legacy: Jared calibrated the lab to a true (0,0). Still applied if non-zero.
        double x = loc.getxMm() + robot.getOffsetX();
        double y = loc.getyMm() + robot.getOffsetY();
        if (robot.isPhysicalTouch()) {
            pi.post(robot, "/touch", x, y);
            return XyTouchResult.ok("PHYSICAL_TAP", x, y);
        }
        pi.post(robot, "/adb", robot.getDevice().getSerial(), "input tap " + x + " " + y);
        return XyTouchResult.ok("ADB_TOUCH", x, y);
    }
}
`;

const XY_RESOURCE = `package com.labsim.orca.web.rest;

import com.labsim.orca.repository.RobotRepository;
import com.labsim.orca.service.XyTouchResult;
import com.labsim.orca.service.XyTouchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** POST /api/xy_touch {"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"} */
@RestController
@RequestMapping("/api")
public class XyTouchResource {

    public record XyTouchRequest(String robot, String screen, String button, String target) {}

    private final RobotRepository robots;
    private final XyTouchService service;

    public XyTouchResource(RobotRepository robots, XyTouchService service) {
        this.robots = robots;
        this.service = service;
    }

    @PostMapping("/xy_touch")
    public ResponseEntity<XyTouchResult> xyTouch(@RequestBody XyTouchRequest req) {
        var robot = robots.findOneByName(req.robot()).orElseThrow(() -> new NotFoundException("no robot named '" + req.robot() + "'"));
        return ResponseEntity.ok(service.touch(robot, req.screen(), req.button()));
    }
}
`;

const CHECKOUT_SERVICE = `package com.labsim.orca.service;

import com.labsim.orca.domain.Robot;
import com.labsim.orca.domain.enumeration.DeviceType;
import com.labsim.orca.domain.enumeration.RobotStatus;
import java.util.Comparator;
import java.util.Map;

/**
 * Robot checkout for Jenkins. Requirements = non-dynamic map from the pipeline script ∪ dynamic JSON from the
 * test definition. Named requests (exact Name) may take an UNAVAILABLE robot; Orca resets it to UNAVAILABLE
 * when the named job finishes. Unnamed requests take the least-recently-used AVAILABLE match.
 */
public class CheckoutService {

    public Robot checkout(CheckoutRequest req) {
        for (String raw : req.deviceTypeValues()) {
            DeviceType.valueOf(raw); // IllegalArgumentException: No enum constant …DeviceType.flex_3
        }
        Map<String, Object> required = req.mergedRequirements(); // 409 on conflicting keys
        if (!req.robotName().isBlank()) {
            return checkoutNamed(req);
        }
        return robots.findByEnvironment(req.environment()).stream()
            .filter(r -> capabilities.matches(r, required))
            .filter(r -> r.getStatus() == RobotStatus.AVAILABLE && r.getCheckout() == null)
            .min(Comparator.comparing(Robot::getLastReleased, Comparator.nullsFirst(Comparator.naturalOrder())).thenComparing(Robot::getId))
            .orElseThrow(() -> new WaitingForRobotException(required));
    }
}
`;

const APP_YML = `spring:
  application:
    name: orca
  jpa:
    open-in-view: false
  liquibase:
    change-log: classpath:config/liquibase/master.xml
server:
  port: 8080
management:
  endpoints:
    web:
      base-path: /management
      exposure:
        include: health,info,metrics
orca:
  health-check:
    interval-ms: 300000
    timeout-ms: 10000
  gort:
    repo: git@github.com:labsim-lab/gort.git
    screen-locations: config/screen-locations
`;

const APP_PROD_YML = `spring:
  datasource:
    url: jdbc:mysql://localhost:3306/orca?useUnicode=true&characterEncoding=utf8&useSSL=false
    username: orca
    password: \${ORCA_DB_PASSWORD}
    hikari:
      pool-name: Hikari
      maximum-pool-size: 20
`;

const APP_GCP_YML = `# WIP — GCP profile (planned migration off the on-prem VM)
spring:
  datasource:
    url: jdbc:mysql:///orca?cloudSqlInstance=labsim-lab:us-east4:orca-sql&socketFactory=com.google.cloud.sql.mysql.SocketFactory
    username: orca
    password: \${ORCA_DB_PASSWORD}
`;

const DOCKERFILE = `# WIP: containerise Orca (planned migration to GCP)
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY target/orca-*.jar /app/orca.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/orca.jar", "--spring.profiles.active=prod,gcp"]
`;

const MASTER_XML = (extra: string[]): string => `<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">
    <include file="config/liquibase/changelog/00000000000000_initial_schema.xml" relativeToChangelogFile="false"/>
    <include file="config/liquibase/changelog/20260309101500_added_entity_Robot.xml" relativeToChangelogFile="false"/>
    <include file="config/liquibase/changelog/20260309101600_added_entity_Device.xml" relativeToChangelogFile="false"/>
    <include file="config/liquibase/changelog/20260309101800_added_entity_MerchantConfig.xml" relativeToChangelogFile="false"/>
    <include file="config/liquibase/changelog/20260309101900_added_entity_Screen.xml" relativeToChangelogFile="false"/>
${extra.map((f) => `    <include file="config/liquibase/changelog/${f}" relativeToChangelogFile="false"/>`).join('\n')}
    <!-- jhipster-needle-liquibase-add-changelog - JHipster will add liquibase changelogs here -->
</databaseChangeLog>
`;

const ROBOT_CHANGELOG = `<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">
    <changeSet id="20260309101500-1" author="jhipster">
        <createTable tableName="robot">
            <column name="id" type="bigint" autoIncrement="true"><constraints primaryKey="true" nullable="false"/></column>
            <column name="name" type="varchar(255)"><constraints nullable="false" unique="true"/></column>
            <column name="human_readable_name" type="varchar(255)"><constraints nullable="false"/></column>
            <column name="status" type="varchar(255)"/>
            <column name="environment" type="varchar(255)"/>
            <column name="adb_service_url" type="varchar(255)"/>
            <column name="camera_stream_url" type="varchar(255)"/>
            <column name="dip_url" type="varchar(255)"/>
            <column name="tap_url" type="varchar(255)"/>
            <column name="swipe_url" type="varchar(255)"/>
            <column name="offset_x" type="double"/>
            <column name="offset_y" type="double"/>
            <column name="reserved_by" type="varchar(255)"/>
            <column name="device_id" type="bigint"/>
            <column name="mfd_device_id" type="bigint"/>
            <column name="cfd_device_id" type="bigint"/>
            <column name="merchant_config_id" type="bigint"/>
        </createTable>
    </changeSet>
    <changeSet id="20260309101500-1-data" author="jhipster" context="faker">
        <loadData file="config/liquibase/fake-data/robot.csv" separator=";" tableName="robot" usePreparedStatements="true">
            <column name="id" type="numeric"/>
            <column name="name" type="string"/>
            <column name="human_readable_name" type="string"/>
            <column name="status" type="string"/>
            <column name="environment" type="string"/>
        </loadData>
    </changeSet>
</databaseChangeLog>
`;

const CREDENTIALS_CHANGELOG = `<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">
    <!-- Go SDK credentials so pipelines can export them as runtime env vars (Tate) -->
    <changeSet id="20260921120000-1" author="tate">
        <addColumn tableName="merchant_config">
            <column name="app_id" type="varchar(255)"/>
            <column name="app_secret" type="varchar(255)"/>
            <column name="api_key" type="varchar(255)"/>
        </addColumn>
    </changeSet>
</databaseChangeLog>
`;

const COMPARE_CHANGELOG = `<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">
    <changeSet id="20260412093000-1" author="jhipster">
        <createTable tableName="screen_compare_image">
            <column name="id" type="bigint" autoIncrement="true"><constraints primaryKey="true" nullable="false"/></column>
            <column name="name" type="varchar(255)"><constraints nullable="false"/></column>
            <column name="screen_name" type="varchar(255)"/>
            <column name="x" type="integer"/>
            <column name="y" type="integer"/>
            <column name="w" type="integer"/>
            <column name="h" type="integer"/>
            <column name="expected_text" type="varchar(255)"><constraints nullable="false"/></column>
            <column name="deprecated" type="boolean"/>
            <column name="robot_id" type="bigint"/>
        </createTable>
    </changeSet>
</databaseChangeLog>
`;

const ROBOTS: [string, string, string][] = [
  ['wall-e', 'AVAILABLE', 'DEV1'], ['eve', 'AVAILABLE', 'DEV1'], ['bumblebee', 'AVAILABLE', 'DEV1'], ['r2-d2', 'AVAILABLE', 'DEV1'],
  ['johnny-5', 'AVAILABLE', 'DEV1'], ['baymax', 'AVAILABLE', 'DEV1'], ['seti', 'AVAILABLE', 'DEV1'], ['rosie', 'UNAVAILABLE', 'DEV1'],
  ['megatron', 'AVAILABLE', 'DEV1'], ['optimus', 'AVAILABLE', 'STG'], ['data', 'AVAILABLE', 'DEV1'], ['tars', 'AVAILABLE', 'DEV1'],
  ['vision', 'AVAILABLE', 'DEV1'], ['k-9', 'AVAILABLE', 'DEV1'], ['soundwave', 'AVAILABLE', 'QA'], ['starscream', 'AVAILABLE', 'QA'],
  ['ratchet', 'AVAILABLE', 'QA'], ['c-3po', 'AVAILABLE', 'QA'], ['bb-8', 'AVAILABLE', 'DEV2'], ['bender', 'UNAVAILABLE', 'STG'],
  ['marvin', 'AVAILABLE', 'QA'], ['robby', 'OFFLINE', 'DEV2'], ['hal', 'AVAILABLE', 'QA'], ['bishop', 'AVAILABLE', 'QA'],
  ['ash', 'AVAILABLE', 'QA'], ['sonny', 'AVAILABLE', 'QA'], ['chappie', 'AVAILABLE', 'QA'], ['case', 'AVAILABLE', 'QA'],
  ['atlas', 'AVAILABLE', 'QA'], ['astro', 'AVAILABLE', 'QA'], ['iron-giant', 'AVAILABLE', 'QA'], ['voltron', 'AVAILABLE', 'INT'],
  ['kryten', 'UNAVAILABLE', 'STG'], ['mazinger', 'AVAILABLE', 'DEV2'], ['jarvis', 'AVAILABLE', 'DEV2'], ['ultron', 'AVAILABLE', 'DEV2'],
  ['dalek', 'OFFLINE', 'QA'], ['number-5', 'AVAILABLE', 'QA'], ['gerty', 'AVAILABLE', 'QA'], ['mother', 'AVAILABLE', 'QA'],
  ['brainiac', 'AVAILABLE', 'DEV2'], ['zorg', 'AVAILABLE', 'QA'],
];
const ROBOT_CSV = `id;name;human_readable_name;status;environment\n${ROBOTS.map(([n, s, e], i) => `${i + 1};${n};${n.toUpperCase()};${s};${e}`).join('\n')}\n`;

const MERCHANT_CSV_V1 = `id;name;merchant_id;environment;tax_rate_bp;pin_bypass;cash_discount_enabled;ubi_route
1;AUTO-US-NOPIN-01;SIMMID0000101;dev1;825;true;false;us-east
2;AUTO-US-NOPIN-02;SIMMID0000102;dev2;825;true;true;us-east
3;GO-SDK-US-01;SIMMID0000301;dev1;825;true;false;us-east
4;PAYCORE-STANDALONE-01;SIMMID0000401;stg;825;false;false;us-east
5;PAYCORE-DINING-01;SIMMID0000501;stg;825;false;false;us-east
6;WESTERS-CA-01;SIMMID0000601;dev1;1300;false;false;ca-central
7;WESTERS-CA-02;SIMMID0000602;qa;1300;false;false;ca-central
`;

const ROBOT_LIST_V1 = `import { Component, OnInit, inject } from '@angular/core';
import { RobotService } from '../service/robot.service';
import { IRobot } from '../robot.model';

@Component({
  standalone: true,
  selector: 'jhi-robot',
  templateUrl: './robot.component.html',
})
export class RobotComponent implements OnInit {
  robots: IRobot[] = [];
  page = 1;
  protected robotService = inject(RobotService);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.robotService.query({ page: this.page - 1, size: 20, sort: ['id,asc'] }).subscribe(res => (this.robots = res.body ?? []));
  }
}
`;

const ROBOT_LIST = `import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RobotService } from '../service/robot.service';
import { IRobot, RobotStatus } from '../robot.model';

/** Robot list with Tate's status / environment / name filters (?status.in=…&environment.equals=…&name.contains=…). */
@Component({
  standalone: true,
  selector: 'jhi-robot',
  templateUrl: './robot.component.html',
})
export class RobotComponent implements OnInit {
  robots: IRobot[] = [];
  page = 1;
  statuses: RobotStatus[] = ['AVAILABLE', 'UNAVAILABLE', 'OFFLINE', 'CONNECTION_FAILED', 'RESERVED'];
  selectedStatuses = new Set<RobotStatus>();
  environment = '';
  nameContains = '';

  protected robotService = inject(RobotService);
  protected route = inject(ActivatedRoute);
  protected router = inject(Router);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.selectedStatuses = new Set((params.get('status.in') ?? '').split(',').filter(Boolean) as RobotStatus[]);
      this.environment = params.get('environment.equals') ?? '';
      this.nameContains = params.get('name.contains') ?? '';
      this.load();
    });
  }

  toggleStatus(s: RobotStatus): void {
    this.selectedStatuses.has(s) ? this.selectedStatuses.delete(s) : this.selectedStatuses.add(s);
    this.navigate();
  }

  navigate(): void {
    const queryParams: Record<string, string> = { page: String(this.page), sort: 'id,asc' };
    if (this.selectedStatuses.size) queryParams['status.in'] = [...this.selectedStatuses].join(',');
    if (this.environment) queryParams['environment.equals'] = this.environment;
    if (this.nameContains) queryParams['name.contains'] = this.nameContains;
    this.router.navigate(['/robot'], { queryParams });
  }

  load(): void {
    const criteria: Record<string, unknown> = { page: this.page - 1, size: 20, sort: ['id,asc'] };
    if (this.selectedStatuses.size) criteria['status.in'] = [...this.selectedStatuses];
    if (this.environment) criteria['environment.equals'] = this.environment;
    if (this.nameContains) criteria['name.contains'] = this.nameContains;
    this.robotService.query(criteria).subscribe(res => (this.robots = res.body ?? []));
  }
}
`;

const MYSQL_YML = `# docker compose -f src/main/docker/mysql.yml up -d
name: orca
services:
  mysql:
    image: mysql:8.2.0
    environment:
      - MYSQL_ALLOW_EMPTY_PASSWORD=yes
      - MYSQL_DATABASE=orca
    ports:
      - 127.0.0.1:3306:3306
    command: mysqld --lower_case_table_names=1 --skip-ssl --character_set_server=utf8mb4 --explicit_defaults_for_timestamp
`;

const J = 'src/main/java/com/labsim/orca';
const R = 'src/main/resources/config';

function initial(): Record<string, string> {
  const files: Record<string, string> = {
    '.yo-rc.json': YO_RC,
    'README.md': README,
    'pom.xml': POM,
    [`${J}/OrcaApp.java`]: APP_JAVA,
    [`${J}/domain/enumeration/DeviceType.java`]: DEVICE_TYPE_JAVA,
    [`${J}/domain/enumeration/RobotStatus.java`]: ROBOT_STATUS,
    [`${J}/domain/enumeration/CapabilityLookup.java`]: CAPABILITY_LOOKUP,
    [`${J}/domain/MerchantConfig.java`]: MERCHANT_V1,
    [`${J}/service/HealthCheckScheduler.java`]: HEALTH,
    [`${J}/service/XyTouchService.java`]: XY_SERVICE,
    [`${J}/service/CheckoutService.java`]: CHECKOUT_SERVICE,
    [`${J}/web/rest/XyTouchResource.java`]: XY_RESOURCE,
    [`${R}/application.yml`]: APP_YML,
    [`${R}/application-prod.yml`]: APP_PROD_YML,
    [`${R}/liquibase/master.xml`]: MASTER_XML([]),
    [`${R}/liquibase/changelog/20260309101500_added_entity_Robot.xml`]: ROBOT_CHANGELOG,
    [`${R}/liquibase/fake-data/robot.csv`]: ROBOT_CSV,
    [`${R}/liquibase/fake-data/merchant_config.csv`]: MERCHANT_CSV_V1,
    'src/main/webapp/app/entities/robot/list/robot.component.ts': ROBOT_LIST_V1,
    'src/main/docker/mysql.yml': MYSQL_YML,
  };
  for (const [k, v] of Object.entries(JHIPSTER)) if (k !== '.jhipster/ScreenCompareImage.json') files[k] = v;
  return files;
}

export const ORCHESTRATOR: RepoSeed = {
  id: 'orchestrator',
  remoteUrl: 'git@github.com:labsim-lab/orchestrator.git',
  description: 'Orca — Spring Boot / JHipster orchestrator',
  protectedMain: true,
  commits: [
    { short: '4d81f20', message: 'Initial JHipster application (orca)', author: 'tate', at: '2026-03-09 10:15', changes: initial() },
    {
      short: '77e1b3f',
      message: 'JHipster entity regen: ScreenCompareImage',
      author: 'tate',
      at: '2026-04-12 09:30',
      changes: {
        '.jhipster/ScreenCompareImage.json': JHIPSTER['.jhipster/ScreenCompareImage.json']!,
        [`${R}/liquibase/changelog/20260412093000_added_entity_ScreenCompareImage.xml`]: COMPARE_CHANGELOG,
        [`${R}/liquibase/master.xml`]: MASTER_XML(['20260412093000_added_entity_ScreenCompareImage.xml']),
      },
    },
    {
      short: 'c9a0d12',
      message: 'Robot list status filter UI (#64)',
      author: 'tate',
      at: '2026-07-08 15:40',
      changes: { 'src/main/webapp/app/entities/robot/list/robot.component.ts': ROBOT_LIST },
    },
    {
      short: '3b8d17a',
      message: 'MerchantConfig: add App ID / App Secret / API Key (#77)',
      author: 'tate',
      at: '2026-09-21 12:00',
      changes: {
        [`${J}/domain/MerchantConfig.java`]: MERCHANT,
        [`${R}/liquibase/changelog/20260921120000_added_merchant_credentials.xml`]: CREDENTIALS_CHANGELOG,
        [`${R}/liquibase/master.xml`]: MASTER_XML(['20260412093000_added_entity_ScreenCompareImage.xml', '20260921120000_added_merchant_credentials.xml']),
      },
    },
  ],
  prs: [
    {
      number: 64,
      title: 'Robot list status filter UI',
      author: 'tate',
      body: 'Filter the robot list by status, environment and name (JHipster criteria params). Finally a one-click "show me everything Connection Failed".',
      sourceBranch: 'tate/robot-status-filter',
      state: 'merged',
      createdAt: '2026-07-07 11:02',
      mergedAt: '2026-07-08 15:40',
      branchCommits: [],
      mergeShort: 'c9a0d12',
      reviewers: ['jared'],
      approvals: ['jared'],
      comments: [],
      verdict: 'APPROVED',
      checks: 'success',
    },
    {
      number: 77,
      title: 'MerchantConfig: add App ID / App Secret / API Key',
      author: 'tate',
      body: 'Go SDK pipelines need merchant credentials as runtime env vars. Adds three columns (Edit dialog only — the list table is already too wide) and exports them from the checkout response.',
      sourceBranch: 'tate/merchant-credentials',
      state: 'merged',
      createdAt: '2026-09-19 10:30',
      mergedAt: '2026-09-21 12:00',
      branchCommits: [],
      mergeShort: '3b8d17a',
      reviewers: ['david'],
      approvals: ['david'],
      comments: [],
      verdict: 'APPROVED',
      checks: 'success',
    },
    {
      number: 81,
      title: 'WIP: Dockerfile + GCP Cloud SQL profile (planned migration)',
      author: 'tate',
      body: 'Draft. First step of moving Orca off the on-prem VM: container image + a `gcp` Spring profile pointing at Cloud SQL. Not for merge yet.',
      sourceBranch: 'tate/docker-gcp',
      state: 'open',
      createdAt: '2026-10-01 17:05',
      draft: true,
      branchCommits: [
        {
          short: 'e2c7b19',
          message: 'WIP: Dockerfile + gcp profile',
          author: 'tate',
          at: '2026-10-01 17:03',
          changes: { Dockerfile: DOCKERFILE, [`${R}/application-gcp.yml`]: APP_GCP_YML },
        },
      ],
      reviewers: [],
      approvals: [],
      comments: [],
      verdict: 'NONE',
      checks: 'pending',
    },
  ],
};

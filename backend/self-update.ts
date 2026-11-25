/*
 * Update Dockge's own compose stack from the UI.
 *
 * Based on Yogui26/dockge-custom (self-update.ts, commits f59c57d and 3006a24),
 * with a single-update lock and a status read-back added.
 *
 * Recreating the Dockge container from inside itself would stop the process doing the work,
 * so a short-lived helper container does it. The helper runs Dockge's own image (which already
 * has the docker CLI and the compose plugin), gets the host's docker socket and Dockge's compose
 * folder mounted at the same path, and runs `docker compose pull` + `up -d` for Dockge's service.
 * This works even when Dockge's compose file is outside the stacks folder (e.g. /opt/dockge).
 */
import * as os from "node:os";
import * as fs from "node:fs";
import childProcessAsync from "promisify-child-process";
import { log } from "./log";
import { ImageRepository } from "./image-repository";

export const HELPER_CONTAINER_NAME = "dockge-self-update";
const HELPER_LABEL = "dockge.self-update=true";
const DOCKER_SOCKET = "/var/run/docker.sock";
const IMAGE_REPOSITORY_KEY = "__dockge_self__";

// What is needed from `docker inspect` of the container Dockge runs in
export interface OwnContainerInfo {
    Id?: string;
    Image?: string;
    Config?: {
        Image?: string;
        Labels?: Record<string, string>;
    };
    Mounts?: { Destination?: string, Source?: string }[];
}

export interface SelfUpdatePlan {
    // Arguments of `docker run`
    runArgs: string[];
    project: string;
    service: string;
    workingDir: string;
    // Image reference from the compose file, e.g. ghcr.io/teejs/dockge:latest
    imageRef: string;
}

export interface SelfUpdateInfo {
    canUpdate: boolean;
    // Why the update is not possible, when canUpdate is false
    reason?: string;
    project?: string;
    service?: string;
    workingDir?: string;
    imageRef?: string;
    updateAvailable?: boolean;
    // Result of the last helper run, if its container still exists
    lastRun?: SelfUpdateRun;
}

export interface SelfUpdateRun {
    running: boolean;
    exitCode: number;
    startedAt: string;
    finishedAt: string;
    log: string;
}

/**
 * Whether Dockge runs inside a container.
 * The official image does not always set DOCKGE_IS_CONTAINER, so /.dockerenv is checked too.
 */
export function isRunningInContainer(): boolean {
    return process.env.DOCKGE_IS_CONTAINER === "1" || fs.existsSync("/.dockerenv");
}

/**
 * Build the docker command that updates the compose service Dockge runs as.
 * All values come from the labels docker compose put on Dockge's own container, not from the client.
 * The script itself is static; values are passed through the environment.
 * @param info Result of `docker inspect` of the current container
 * @returns The command to run
 * @throws Error if Dockge is not started by docker compose
 */
export function buildSelfUpdatePlan(info: OwnContainerInfo): SelfUpdatePlan {
    const labels = info.Config?.Labels ?? {};
    const project = labels["com.docker.compose.project"];
    const service = labels["com.docker.compose.service"];
    const workingDir = labels["com.docker.compose.project.working_dir"];
    const configFiles = labels["com.docker.compose.project.config_files"];

    if (!project || !service || !workingDir || !configFiles) {
        throw new Error("Dockge is not started by docker compose, it cannot update itself.");
    }

    if (!info.Image) {
        throw new Error("Unable to find the image of the current container.");
    }

    // The socket is mounted from the host path that was given to Dockge
    const socketSource = info.Mounts?.find(m => m.Destination === DOCKER_SOCKET)?.Source || DOCKER_SOCKET;

    // Short pause so the UI gets its answer before Dockge goes down
    const script = "sleep 3 && docker compose pull \"$DOCKGE_UPDATE_SERVICE\" && docker compose up -d --no-deps \"$DOCKGE_UPDATE_SERVICE\"";

    return {
        project,
        service,
        workingDir,
        imageRef: info.Config?.Image ?? "",
        runArgs: [
            "run", "-d",
            "--name", HELPER_CONTAINER_NAME,
            "--label", HELPER_LABEL,
            "-v", `${socketSource}:${DOCKER_SOCKET}`,
            // Same path inside and outside: relative paths in the compose file resolve to the same host folders
            "-v", `${workingDir}:${workingDir}`,
            "-w", workingDir,
            "-e", `COMPOSE_PROJECT_NAME=${project}`,
            "-e", `COMPOSE_FILE=${configFiles.split(",").join(":")}`,
            "-e", `DOCKGE_UPDATE_SERVICE=${service}`,
            "--entrypoint", "sh",
            // The image id of the running container: always present locally, no pull needed
            info.Image,
            "-c", script,
        ],
    };
}

/**
 * Find the id of the container Dockge runs in.
 * @returns The container id or name
 */
function getOwnContainerId(): string {
    try {
        // Docker bind mounts files such as /etc/hostname from /var/lib/docker/containers/<id>/
        const match = fs.readFileSync("/proc/self/mountinfo", "utf-8").match(/\/containers\/([0-9a-f]{64})\//);
        if (match) {
            return match[1];
        }
    } catch (_) {
        // Fall through to the hostname
    }

    // By default the hostname of a container is its short id
    return os.hostname();
}

/**
 * Inspect the container Dockge runs in and work out the update command.
 * @throws Error if Dockge does not run in a container started by docker compose
 */
async function getPlan(): Promise<SelfUpdatePlan> {
    if (!isRunningInContainer()) {
        throw new Error("Dockge is not running in a container, update it manually.");
    }

    const inspect = await childProcessAsync.spawn("docker", [ "inspect", "--format", "json", "--", getOwnContainerId() ], {
        encoding: "utf-8",
    });

    const info = JSON.parse(inspect.stdout?.toString() || "[]")[0] as OwnContainerInfo | undefined;
    if (!info) {
        throw new Error("Unable to inspect the current container.");
    }

    return buildSelfUpdatePlan(info);
}

/**
 * Read the state and log of the helper container from the last update, if it still exists.
 */
async function getLastRun(): Promise<SelfUpdateRun | undefined> {
    try {
        const inspect = await childProcessAsync.spawn("docker", [ "inspect", "--format", "json", "--", HELPER_CONTAINER_NAME ], {
            encoding: "utf-8",
        });
        const info = JSON.parse(inspect.stdout?.toString() || "[]")[0];
        if (!info?.State) {
            return undefined;
        }

        const logs = await childProcessAsync.spawn("docker", [ "logs", "--tail", "50", HELPER_CONTAINER_NAME ], {
            encoding: "utf-8",
        });

        return {
            running: !!info.State.Running,
            exitCode: info.State.ExitCode ?? -1,
            startedAt: info.State.StartedAt ?? "",
            finishedAt: info.State.FinishedAt ?? "",
            log: ((logs.stdout?.toString() ?? "") + (logs.stderr?.toString() ?? "")).trim(),
        };
    } catch (_) {
        // No helper container: no update has run since it was last removed
        return undefined;
    }
}

/**
 * Whether Dockge can update itself, whether a newer image is available, and the last update's result.
 * @param checkRemote Also ask the registry for the latest image digest (uses skopeo)
 */
export async function getSelfUpdateInfo(checkRemote: boolean): Promise<SelfUpdateInfo> {
    let plan: SelfUpdatePlan;
    try {
        plan = await getPlan();
    } catch (e) {
        return {
            canUpdate: false,
            reason: e instanceof Error ? e.message : String(e),
        };
    }

    let updateAvailable: boolean | undefined;
    if (plan.imageRef) {
        try {
            const imageInfo = checkRemote
                ? await ImageRepository.INSTANCE.update(IMAGE_REPOSITORY_KEY, plan.service, plan.imageRef)
                : ImageRepository.INSTANCE.getImageInfo(IMAGE_REPOSITORY_KEY, plan.service, plan.imageRef);
            updateAvailable = imageInfo.isImageUpdateAvailable();
        } catch (e) {
            log.warn("self-update", "Unable to check for a newer image: " + e);
        }
    }

    return {
        canUpdate: true,
        project: plan.project,
        service: plan.service,
        workingDir: plan.workingDir,
        imageRef: plan.imageRef,
        updateAvailable,
        lastRun: await getLastRun(),
    };
}

/**
 * Update Dockge itself: pull the new image and recreate the container, done by a helper container.
 * Returns as soon as the helper is started; Dockge restarts a few seconds later.
 * @throws Error if Dockge cannot update itself or an update is already running
 */
export async function startSelfUpdate(): Promise<void> {
    const plan = await getPlan();

    const lastRun = await getLastRun();
    if (lastRun?.running) {
        throw new Error("A Dockge update is already running.");
    }

    // The helper from the previous update is no longer needed
    await childProcessAsync.spawn("docker", [ "rm", "-f", HELPER_CONTAINER_NAME ], { encoding: "utf-8" }).catch(() => {});

    log.info("self-update", `Updating ${plan.project}/${plan.service} in ${plan.workingDir}`);
    const res = await childProcessAsync.spawn("docker", plan.runArgs, { encoding: "utf-8" });
    if (res.code !== 0) {
        throw new Error("Unable to start the update helper: " + (res.stderr?.toString().trim() || "unknown error"));
    }
}

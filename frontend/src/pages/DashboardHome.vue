<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <h1 class="mb-3">
                {{ $t("home") }}
            </h1>

            <div class="row first-row">
                <!-- Left -->
                <div class="col-xl-7">
                    <!-- Stats -->
                    <div class="shadow-box big-padding text-center mb-5">
                        <div class="row">
                            <template v-for="(info, index) in statusInfos" :key="index">
                                <div v-if="getStatusCount(info.statusIds) > 0" class="col">
                                    <h3>{{ $t(info.label) }}</h3>
                                    <span class="num num-lg" :style="getInfoStyle(info)" @click="filterStackList(undefined, info)">{{ getStatusCount(info.statusIds) }}</span>
                                </div>
                            </template>
                        </div>

                        <!-- Update all stacks with a newer image -->
                        <div v-if="updatableStacks.length > 0 || updateAll.running" class="mt-4">
                            <button class="btn btn-info" data-toggle="tooltip" :title="$t('tooltipUpdateAll')" @click="openUpdateAllDialog">
                                <font-awesome-icon icon="cloud-arrow-down" class="me-2" />
                                <template v-if="updateAll.running">{{ $t("updateAllRunning") }}</template>
                                <template v-else>{{ $t("updateAll") }} ({{ updatableStacks.length }})</template>
                            </button>
                        </div>
                    </div>

                    <!-- Update All Dialog -->
                    <BModal v-model="showUpdateAllDialog" :title="$t('updateAll')" size="lg" :no-close-on-backdrop="true" :close-on-esc="!updateAll.running" :hide-header-close="updateAll.running" :okTitle="updateAll.items.length > 0 && !updateAll.running ? $t('close') : $t('updateAll')" okVariant="primary" :ok-disabled="updateAll.running || (updateAll.items.length === 0 && selectedUpdateCount === 0)" :ok-only="updateAll.running || updateAll.items.length > 0" @ok="onUpdateAllOk">
                        <!-- Choose stacks -->
                        <template v-if="updateAll.items.length === 0">
                            <p>{{ $t("updateAllMsg") }}</p>
                            <div v-for="stack in updatableStacks" :key="stack.name + '_' + stack.endpoint" class="form-check">
                                <input :id="'updateAll_' + stack.name + '_' + stack.endpoint" v-model="updateAllSelection[stack.name + '_' + stack.endpoint]" class="form-check-input" type="checkbox">
                                <label class="form-check-label" :for="'updateAll_' + stack.name + '_' + stack.endpoint">
                                    {{ stack.name }}
                                    <span v-if="Object.keys(agentList).length > 1" class="text-muted small">({{ $root.getAgentName(stack.endpoint) }})</span>
                                </label>
                            </div>

                            <hr>
                            <BFormCheckbox v-model="updateAll.prune" switch><span v-html="$t('pruneAfterUpdate')"></span></BFormCheckbox>
                            <div class="ms-4 mt-1">
                                <BFormCheckbox v-model="updateAll.pruneAll" :disabled="!updateAll.prune"><span v-html="$t('pruneAllAfterUpdate')"></span></BFormCheckbox>
                            </div>
                            <p class="small text-muted mt-2 mb-0">{{ $t("updateAllPruneNote") }}</p>
                        </template>

                        <!-- Progress -->
                        <template v-else>
                            <p v-if="updateAll.running">{{ $t("updateAllKeepOpen") }}</p>
                            <ul class="list-unstyled mb-0">
                                <li v-for="item in updateAll.items" :key="item.name + '_' + item.endpoint" class="mb-1">
                                    <font-awesome-icon v-if="item.state === 'running'" icon="rotate" spin class="me-2" />
                                    <font-awesome-icon v-else-if="item.state === 'ok'" icon="check" class="me-2 text-success" />
                                    <font-awesome-icon v-else-if="item.state === 'error'" icon="times" class="me-2 text-danger" />
                                    <span v-else class="me-2 pending-dot">·</span>
                                    <router-link :to="getStackUrl(item)" @click="showUpdateAllDialog = false">{{ item.name }}</router-link>
                                    <span v-if="Object.keys(agentList).length > 1" class="text-muted small"> ({{ $root.getAgentName(item.endpoint) }})</span>
                                    <span v-if="item.state === 'error'" class="text-danger small ms-2">{{ item.msg }}</span>
                                </li>
                            </ul>
                            <p v-if="!updateAll.running" class="mt-3 mb-0">
                                {{ $t("updateAllDone", { ok: updateAllCount('ok'), failed: updateAllCount('error') }) }}
                            </p>
                        </template>
                    </BModal>

                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4>{{ $tc("dockgeAgent", 2) }}</h4>
                        <button v-if="!showAgentForm" class="btn btn-primary" @click="showAgentForm = !showAgentForm">
                            <font-awesome-icon icon="plus" /> {{ $t("addAgent") }}
                        </button>
                    </div>

                    <!-- Agent list -->
                    <div v-for="(agent, endpoint) in agentList" :key="endpoint" class="mb-3 agent">
                        <div class="shadow-box big-padding">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-baseline">
                                    <h4 class="me-2">{{ getAgentName(agent) }}</h4>

                                    <!-- Edit Name  -->
                                    <font-awesome-icon class="ms-3 action-icon" icon="pen-to-square" @click="editAgentName(agent)" />

                                    <!-- Remove Button -->
                                    <font-awesome-icon v-if="endpoint !== ''" class="ms-3 action-icon" icon="trash" @click="showRemoveAgentDialog[agent.endpoint] = !showRemoveAgentDialog[agent.endpoint]" />
                                </div>

                                <div v-if="agentStatusList[endpoint] === 'online'" class="d-flex flex-wrap gap-2 justify-content-end">
                                    <!-- Update Dockge itself -->
                                    <button v-if="selfUpdateInfo[endpoint]?.canUpdate" class="btn btn-sm btn-normal" data-toggle="tooltip" :title="$t('tooltipSelfUpdate')" @click="showSelfUpdateDialog[endpoint] = true">
                                        <font-awesome-icon icon="cloud-arrow-down" class="me-2" />{{ $t("selfUpdate") }}
                                    </button>

                                    <router-link class="btn btn-sm btn-normal" data-toggle="tooltip" :title="$t('tooltipAgentMaintenance')" :to="getAgentRouteLink(agent)">
                                        <font-awesome-icon icon="wrench" class="me-2" />{{ $t("maintenance") }}
                                    </router-link>
                                </div>
                            </div>

                            <div class="mb-3">
                                <span class="url">{{ !!agent.url ? agent.url : "local" }}</span>
                            </div>

                            <div class="d-flex flex-wrap gap-3">
                                <!-- Agent Status -->
                                <template v-if="agentStatusList[endpoint]">
                                    <span v-if="agentStatusList[endpoint] === 'online'" class="badge bg-primary me-2">{{ $t("agentOnline") }}</span>
                                    <span v-else-if="agentStatusList[endpoint] === 'offline'" class="badge bg-danger me-2">{{ $t("agentOffline") }}</span>
                                    <span v-else class="badge bg-secondary me-2">{{ $t(agentStatusList[endpoint]) }}</span>
                                </template>
                                <template v-if="agentStatusList[endpoint] === 'online' && selfUpdateInfo[endpoint]?.canUpdate">
                                    <span v-if="selfUpdateInfo[endpoint].lastRun?.running" class="badge bg-info me-2">{{ $t("selfUpdateRunning") }}</span>
                                    <span v-else-if="selfUpdateInfo[endpoint].updateAvailable" class="badge bg-info me-2 clickable" @click="showSelfUpdateDialog[endpoint] = true">
                                        <font-awesome-icon icon="arrow-up" class="me-1" />{{ $t("selfUpdateAvailable") }}
                                    </span>
                                    <span v-if="selfUpdateFailed(endpoint)" class="badge bg-danger me-2 clickable" @click="showSelfUpdateDialog[endpoint] = true">{{ $t("selfUpdateFailed") }}</span>
                                </template>
                                <template v-if="Object.keys(agentList).length > 1">
                                    <template v-for="(info, index) in statusInfos" :key="index">
                                        <template v-if="getEndpointStatusCount(endpoint, info.statusIds) > 0">
                                            <div>{{ $t(info.label) }}: <span class="num" :style="getInfoStyle(info)" @click="filterStackList(endpoint, info)">{{ getEndpointStatusCount(endpoint, info.statusIds) }}</span></div>
                                        </template>
                                    </template>
                                </template>
                            </div>

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agent.endpoint]" :title="!!endpoint ? endpoint : 'Master'" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="primary" @ok="updateAgentName(agent, editAgentNewName[agent.endpoint])">
                                <input :id="'nameUpdate' + agent.endpoint" v-model="editAgentNewName[agent.endpoint]" type="text" class="form-control">
                            </BModal>

                            <!-- Self-update Dialog -->
                            <BModal v-model="showSelfUpdateDialog[endpoint]" :title="$t('selfUpdate') + ': ' + getAgentName(agent)" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('selfUpdate')" okVariant="primary" :ok-disabled="!!selfUpdateInfo[endpoint]?.lastRun?.running" @ok="startSelfUpdate(endpoint)">
                                <p>{{ $t("selfUpdateMsg") }}</p>
                                <p v-if="selfUpdateInfo[endpoint]?.canUpdate" class="small text-muted mb-3">
                                    <code>{{ selfUpdateInfo[endpoint].imageRef }}</code><br>
                                    {{ selfUpdateInfo[endpoint].workingDir }} ({{ selfUpdateInfo[endpoint].project }}/{{ selfUpdateInfo[endpoint].service }})
                                </p>
                                <template v-if="selfUpdateInfo[endpoint]?.lastRun">
                                    <h6>{{ $t("selfUpdateLastRun") }}: {{ formatSelfUpdateRun(selfUpdateInfo[endpoint].lastRun) }}</h6>
                                    <pre class="self-update-log">{{ selfUpdateInfo[endpoint].lastRun.log || "-" }}</pre>
                                </template>
                            </BModal>

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agent.endpoint]" :title="getAgentName(agent)" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agent)">
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>
                    </div>

                    <!-- Add Agent Form -->
                    <BModal id="addAgentDialog" v-model="showAgentForm" :title="$t('addAgent')" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="connectingAgent ? $t('connecting') : $t('connect')" okVariant="primary" @ok="addAgent" @show="resetNewAgent" @hidden="resetNewAgent">
                        <form @submit.prevent>
                            <div class="mb-3">
                                <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="newAgent.url" type="url" class="form-control" required placeholder="http://">
                            </div>

                            <div class="mb-3">
                                <label for="username" class="form-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="newAgent.username" type="text" class="form-control" required>
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="newAgent.password" type="password" class="form-control" required autocomplete="new-password">
                            </div>

                            <div class="mb-3">
                                <label for="name" class="form-label">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="newAgent.name" type="text" class="form-control" optional>
                            </div>
                        </form>
                    </BModal>
                </div>

                <!-- Right -->
                <div class="col-xl-5">
                    <!-- Docker Run -->
                    <h2 class="mb-3">{{ $t("Docker Run") }}</h2>
                    <div class="mb-3">
                        <textarea id="name" v-model="dockerRunCommand" type="text" class="form-control docker-run" required placeholder="docker run ..."></textarea>
                    </div>

                    <button class="btn-normal btn mb-4" @click="convertDockerRun">{{ $t("Convert to Compose") }}</button>
                    <!-- Agent List -->
                </div>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { AgentData, SimpleStackData } from "../../../common/types";
import { StackFilter, StackStatusInfo } from "../../../common/util-common";

type UpdateAllItem = {
    name: string,
    endpoint: string,
    // Prune images after this stack (the last one of its agent)
    prune: boolean,
    state: "pending" | "running" | "ok" | "error",
    msg: string,
};

export default defineComponent({
    components: {

    },
    props: {
    },
    data(this: {newAgent: AgentData}) {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            editAgentNewName: {},
            connectingAgent: false,
            newAgent: {},
            // Self-update info per agent endpoint (from the "getSelfUpdateInfo" agent event)
            selfUpdateInfo: {},
            showSelfUpdateDialog: {},
            // Update all
            showUpdateAllDialog: false,
            updateAllSelection: {} as Record<string, boolean>,
            updateAll: {
                running: false,
                prune: true,
                pruneAll: true,
                items: [] as UpdateAllItem[],
            },
        };
    },

    computed: {
        agentList(): Record<string, AgentData> {
            return this.$root.agentList;
        },
        agentStatusList(): Record<string, string> {
            return this.$root.agentStatusList;
        },
        stackList(): Record<string, SimpleStackData> {
            return this.$root.completeStackList;
        },
        statusInfos(): StackStatusInfo[] {
            return StackStatusInfo.ALL;
        },
        // Running stacks with a newer image that Dockge can update (same condition as the ↑ in the stack list;
        // stacks outside the stacks folder can't be updated from Dockge, so they are left out)
        updatableStacks(): SimpleStackData[] {
            return (Object.values(this.stackList) as SimpleStackData[])
                .filter(s => s.started && s.imageUpdatesAvailable && s.isManagedByDockge && this.agentStatusList[s.endpoint] === "online")
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        selectedUpdateCount(): number {
            return this.updatableStacks.filter(s => this.updateAllSelection[s.name + "_" + s.endpoint]).length;
        },
        stackStatusCountByEndpoint(): Map<string, Map<number, number>> {
            const counts = new Map<string, Map<number, number>>();
            for (const stackData of Object.values(this.stackList) as SimpleStackData[]) {
                let endpointCounts = counts.get(stackData.endpoint);
                if (!endpointCounts) {
                    endpointCounts = new Map<number, number>();
                    counts.set(stackData.endpoint, endpointCounts);
                }

                endpointCounts.set(stackData.status, (endpointCounts.get(stackData.status) ?? 0) + 1);
            }

            return counts;
        },
        stackStatusCountOverall(): Map<number, number> {
            const counts = new Map<number, number>();

            for (const [ , innerMap ] of this.stackStatusCountByEndpoint) {
                for (const [ status, value ] of innerMap) {
                    counts.set(status, (counts.get(status) ?? 0) + value);
                }
            }

            return counts;
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },

        // When an agent comes (back) online, e.g. after Dockge restarted itself, refresh its self-update info
        agentStatusList: {
            deep: true,
            handler(newList: Record<string, string>) {
                for (const [ endpoint, status ] of Object.entries(newList)) {
                    if (status !== "online") {
                        // Forget it, so it is reloaded once the agent is back
                        delete this.selfUpdateInfo[endpoint];
                    } else if (this.selfUpdateInfo[endpoint] === undefined) {
                        this.loadSelfUpdateInfo(endpoint);
                    }
                }
            },
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();

        this.resetNewAgent();

        for (const [ endpoint, status ] of Object.entries(this.agentStatusList)) {
            if (status === "online") {
                this.loadSelfUpdateInfo(endpoint);
            }
        }
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        getInfoStyle(info: StackStatusInfo) {
            return `color: var(--dockge-${info.textColor}-color);`;
        },

        getAgentName(agent) {
            return this.$root.getAgentName(agent.endpoint);
        },

        openUpdateAllDialog() {
            if (!this.updateAll.running) {
                // Start fresh: every updatable stack ticked, no previous results
                this.updateAll.items = [];
                this.updateAllSelection = Object.fromEntries(this.updatableStacks.map(s => [ s.name + "_" + s.endpoint, true ]));
            }
            this.showUpdateAllDialog = true;
        },

        onUpdateAllOk(bvModalEvt) {
            if (this.updateAll.items.length > 0) {
                // Finished: "Close"
                return;
            }
            // Keep the dialog open to show the progress
            bvModalEvt.preventDefault();
            this.runUpdateAll();
        },

        async runUpdateAll() {
            const selected = this.updatableStacks.filter(s => this.updateAllSelection[s.name + "_" + s.endpoint]);
            if (selected.length === 0) {
                return;
            }

            // Group by agent; prune once per agent, after its last stack, instead of after every stack
            const items: UpdateAllItem[] = [];
            const endpoints = [ ...new Set(selected.map(s => s.endpoint)) ];
            for (const endpoint of endpoints) {
                const stacks = selected.filter(s => s.endpoint === endpoint);
                stacks.forEach((s, i) => items.push({
                    name: s.name,
                    endpoint,
                    prune: this.updateAll.prune && i === stacks.length - 1,
                    state: "pending",
                    msg: "",
                }));
            }

            this.updateAll.items = items;
            this.updateAll.running = true;

            // One at a time: pulls in parallel would compete for bandwidth and make failures hard to follow
            for (const item of this.updateAll.items) {
                item.state = "running";
                const res = await this.emitAgentAsync(item.endpoint, "updateStack", item.name, item.prune, item.prune && this.updateAll.pruneAll);
                item.state = res.ok ? "ok" : "error";
                item.msg = res.ok ? "" : (res.msgi18n ? this.$t(res.msg) : res.msg);
            }

            this.updateAll.running = false;

            const failed = this.updateAllCount("error");
            this.$root.toastRes({
                ok: failed === 0,
                msg: this.$t("updateAllDone", {
                    ok: this.updateAllCount("ok"),
                    failed,
                }),
            });
        },

        emitAgentAsync(endpoint: string, eventName: string, ...args: unknown[]): Promise<{ ok: boolean, msg?: string, msgi18n?: boolean }> {
            return new Promise((resolve) => {
                this.$root.emitAgent(endpoint, eventName, ...args, (res) => resolve(res ?? {
                    ok: false,
                    msg: "No response",
                }));
            });
        },

        updateAllCount(state: UpdateAllItem["state"]): number {
            return this.updateAll.items.filter(i => i.state === state).length;
        },

        getStackUrl(item: UpdateAllItem): string {
            return item.endpoint ? `/compose/${item.name}/${item.endpoint}` : `/compose/${item.name}`;
        },

        loadSelfUpdateInfo(endpoint: string) {
            // Mark as loading, so the status watcher does not ask twice
            this.selfUpdateInfo[endpoint] = null;

            // Agents running an older Dockge don't know this event and never answer: no button is shown for them
            this.$root.emitAgent(endpoint, "getSelfUpdateInfo", true, (res) => {
                if (res.ok) {
                    this.selfUpdateInfo[endpoint] = res.info;

                    // While an update runs, check again until it is finished (or Dockge restarts)
                    if (res.info?.lastRun?.running) {
                        setTimeout(() => this.loadSelfUpdateInfo(endpoint), 5000);
                    }
                }
            });
        },

        startSelfUpdate(endpoint: string) {
            this.$root.emitAgent(endpoint, "selfUpdate", (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    // Dockge restarts in a few seconds; the status watcher reloads the info when it is back
                    setTimeout(() => this.loadSelfUpdateInfo(endpoint), 2000);
                }
            });
        },

        selfUpdateFailed(endpoint: string): boolean {
            const lastRun = this.selfUpdateInfo[endpoint]?.lastRun;
            return !!lastRun && !lastRun.running && lastRun.exitCode !== 0;
        },

        formatSelfUpdateRun(lastRun): string {
            if (lastRun.running) {
                return this.$t("selfUpdateRunning");
            }
            const when = lastRun.finishedAt ? new Date(lastRun.finishedAt).toLocaleString() : "";
            const result = lastRun.exitCode === 0 ? this.$t("selfUpdateSucceeded") : this.$t("selfUpdateFailed");
            return `${result} ${when}`.trim();
        },

        getAgentRouteLink(agent) {
            if (!!agent.endpoint) {
                return `/agent/${agent.endpoint}`;
            } else {
                return "/agent";
            }
        },

        getStatusCount(status: number[]): number {
            return status.reduce((acc, s) => acc + (this.stackStatusCountOverall.get(s) ?? 0), 0);
        },

        getEndpointStatusCount(endpoint: string, status: number[]): number {
            return status.reduce((acc, s) => acc + (this.stackStatusCountByEndpoint.get(endpoint)?.get(s) ?? 0), 0);
        },

        filterStackList(endpoint: string | undefined, statusInfo: StackStatusInfo) {
            const stackFilter = this.$root.stackFilter as StackFilter;
            stackFilter.clear();

            if (endpoint !== undefined) {
                stackFilter.agents.selected.add(endpoint);
            }

            stackFilter.status.selected.add(statusInfo.label);

            if (this.$root.isMobile) {
                this.$router.push("/stacks");
            }
        },

        resetNewAgent() {
            this.newAgent = {
                url: "http://",
                username: "",
                password: "",
                name: "",
            };
        },

        addAgent(bvModalEvt) {
            bvModalEvt.preventDefault();
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.newAgent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(agent: AgentData) {
            this.$root.getSocket().emit("removeAgent", agent.url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[agent.endpoint];
                }
            });
        },

        editAgentName(agent: AgentData) {
            this.editAgentNewName[agent.endpoint] = agent.name;
            this.showEditAgentNameDialog[agent.endpoint] = true;
        },

        updateAgentName(agent: AgentData, updatedName: string) {
            this.$root.getSocket().emit("updateAgent", agent.url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
});
</script>

<style lang="scss" scoped>
@import "../styles/vars";

.num-lg {
    font-size: 30px;
    display: block;
}

.num {
    cursor: pointer;
    font-weight: bold;
}

.clickable {
    cursor: pointer;
}

.self-update-log {
    max-height: 300px;
    overflow: auto;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-all;
}

.url {
    font-size: 0.8rem;
    color: #6c757d;
}

.shadow-box {
    padding: 20px;
}

table {
    font-size: 14px;

    tr {
        transition: all ease-in-out 0.2ms;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

.docker-run {
    background-color: $dark-bg !important;
    border: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
}

.action-icon {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.3);
}

.agent {
    a {
        text-decoration: none;
    }
}

</style>

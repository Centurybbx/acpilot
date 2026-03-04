export interface AcpRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: Record<string, unknown>;
}
export interface AcpResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface AcpEvent {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}
export interface ConfigOption {
    name: string;
    type: 'string' | 'boolean' | 'enum';
    values?: string[];
    default?: string;
    description?: string;
}
export interface SlashCommand {
    name: string;
    description?: string;
    params?: string[];
}
export interface Mode {
    name: string;
    description?: string;
}
export interface PermissionModel {
    mode?: 'manual' | 'auto';
    actions?: string[];
}
export interface ToolCallInfo {
    name: string;
    input?: Record<string, unknown>;
    output?: unknown;
}
export interface AgentCapabilities {
    configOptions?: ConfigOption[];
    modes?: Mode[];
    commands?: SlashCommand[];
    permissions?: PermissionModel;
    supportsResume?: boolean;
    supportsLoad?: boolean;
    contextFiles?: number;
}
//# sourceMappingURL=acp.d.ts.map
import { PermissionEnum } from '@/enums/permission-enum';

export type AiActionPresetCategory =
    | 'comuni'
    | 'dati'
    | 'file'
    | 'admin'
    | 'avanzate';

export type AiActionPreset = {
    id: string;
    category: AiActionPresetCategory;
    title: string;
    description: string;
    prompt: string;
    /** Permissions that unlock this preset in the UI (any). Empty = always shown if CanUseAi. */
    anyOf?: PermissionEnum[];
    destructive?: boolean;
};

export const AI_ACTION_PRESET_CATEGORY_LABELS: Record<
    AiActionPresetCategory,
    string
> = {
    comuni: 'Comuni',
    dati: 'Dati & import',
    file: 'File',
    admin: 'Amministrazione',
    avanzate: 'Avanzate',
};

export const AI_ACTION_PRESETS: AiActionPreset[] = [
    {
        id: 'new-typed-collection',
        category: 'comuni',
        title: 'Nuova collection tipizzata',
        description: 'Crea schema con campi tipizzati da descrizione',
        prompt:
            'Crea una nuova collection chiamata «NOME_COLLECTION» con questi campi tipizzati (usa create_field con il type corretto, non string generico):\n- …\nPoi riepiloga id, slug e campi creati.',
        anyOf: [
            PermissionEnum.CanCreateCollections,
            PermissionEnum.CanEditCollections,
        ],
    },
    {
        id: 'list-collections',
        category: 'comuni',
        title: 'Elenca le collection',
        description: 'Mostra collection esistenti con id e campi',
        prompt:
            'Elenca le mie collection (id, nome, slug, numero item). Se ne indico una, mostra anche i campi.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'import-csv',
        category: 'dati',
        title: 'Importa CSV allegato',
        description: 'Crea/aggiorna collection da file CSV in chat',
        prompt:
            'Ho allegato un CSV. Importalo in una collection chiamata «NOME_COLLECTION» (creala se non esiste). Inferisci i tipi dei campi dal contenuto. Alla fine dimmi quanti item creati/aggiornati.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-excel',
        category: 'dati',
        title: 'Importa Excel allegato',
        description: 'Import da file .xlsx',
        prompt:
            'Ho allegato un file Excel (.xlsx). Importalo nella collection «NOME_COLLECTION» (creala se serve), con inferenza tipi. Riepiloga il risultato.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-url-json',
        category: 'dati',
        title: 'Importa JSON da URL',
        description: 'Fetch remoto (es. Directus) → collection',
        prompt:
            'Importa i dati JSON da questo URL nella collection «NOME_COLLECTION»:\nURL: https://…\nSe serve autenticazione Bearer dimmelo prima. Inferisci i tipi e riepiloga quanti record hai importato.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-dry-run',
        category: 'dati',
        title: 'Anteprima import (dry-run)',
        description: 'Simula senza scrivere dati',
        prompt:
            'Esegui un dry_run=true (nessuna scrittura) sull’import da allegato o URL che ti indico. Mostra schema proposto, tipi inferiti e anteprima delle prime righe.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-upsert',
        category: 'dati',
        title: 'Sync / upsert',
        description: 'Ri-import senza duplicare (chiave univoca)',
        prompt:
            'Sincronizza i dati (upsert) nella collection «NOME_COLLECTION» usando come chiave il campo «CAMPO_CHIAVE» (es. sku o id esterno). Aggiorna gli item esistenti e crea solo quelli nuovi. Fonte: allegato o URL che ti indico.',
        anyOf: [PermissionEnum.CanCreateCollections, PermissionEnum.CanEditCollections],
    },
    {
        id: 'export-collection',
        category: 'dati',
        title: 'Esporta collection',
        description: 'Export CSV o JSON',
        prompt:
            'Esporta la collection «NOME_COLLECTION» in formato CSV (oppure JSON se chiedo altrimenti). Dammi un riepilogo e il contenuto o il percorso generato.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'bulk-edit',
        category: 'dati',
        title: 'Modifica massiva item',
        description: 'Aggiorna molti item con un filtro',
        prompt:
            'Nella collection «NOME_COLLECTION», aggiorna in blocco gli item dove «CAMPO» = «VALORE» impostando: …\nConferma prima quanti record matched, poi esegui.',
        anyOf: [PermissionEnum.CanEditCollections],
        destructive: true,
    },
    {
        id: 'bulk-delete',
        category: 'dati',
        title: 'Elimina massiva item',
        description: 'Soft-delete di item filtrati',
        prompt:
            'Nella collection «NOME_COLLECTION», elimina (soft-delete) gli item dove «CAMPO» = «VALORE». Prima dimmi quanti ne troveresti, poi procedi solo dopo conferma.',
        anyOf: [PermissionEnum.CanDeleteCollections],
        destructive: true,
    },
    {
        id: 'nl-query',
        category: 'dati',
        title: 'Query in linguaggio naturale',
        description: 'Filtra e conta item',
        prompt:
            'Sulla collection «NOME_COLLECTION», rispondi a questa domanda con dati reali (usa i tool di query/list):\n«…»\nMostra i risultati in tabella sintetica.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'pdf-to-schema',
        category: 'dati',
        title: 'PDF → schema / dati',
        description: 'Estrai testo da PDF e proponi collection',
        prompt:
            'Ho allegato un PDF. Estraine il testo, proponimi uno schema di collection con campi tipizzati e, se ha senso, importa i record strutturabili. Chiedimi conferma prima di scrivere.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'duplicate-collection',
        category: 'dati',
        title: 'Duplica collection',
        description: 'Copia schema (e opzionalmente sample)',
        prompt:
            'Duplica la collection con id «ID» (solo schema). Se chiedo anche i dati sample, copia i primi item.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'restore-collection',
        category: 'dati',
        title: 'Ripristina collection dal cestino',
        description: 'Restore soft-delete',
        prompt:
            'Elenca le collection nel cestino e ripristina quella chiamata «NOME» (o id …).',
        anyOf: [PermissionEnum.CanRestoreCollections],
    },
    {
        id: 'manage-files',
        category: 'file',
        title: 'Organizza file',
        description: 'Cartelle, sposta, rinomina',
        prompt:
            'Nel file manager: elenca la cartella corrente, poi crea/organizzi come ti chiedo (cartelle, rename, move). Usa ManageFiles action "move" con file_id e target_parent_id. Non eliminare definitivamente senza conferma.',
        anyOf: [
            PermissionEnum.CanShowFiles,
            PermissionEnum.CanCreateFiles,
            PermissionEnum.CanEditFiles,
        ],
    },
    {
        id: 'move-files',
        category: 'file',
        title: 'Sposta file',
        description: 'Sposta file/cartelle in un’altra cartella',
        prompt:
            'Sposta i file/cartelle «NOME_O_ID» nella cartella «DESTINAZIONE» (o root). Per più elementi usa ManageFiles action "move_many" (source_parent_id o file_ids_json + target_parent_id). Per uno solo usa "move". Poi elenca la destinazione per conferma.',
        anyOf: [PermissionEnum.CanEditFiles],
    },
    {
        id: 'attach-file-to-item',
        category: 'file',
        title: 'Collega file a un item',
        description: 'Imposta campo file/image su un item',
        prompt:
            'Trova il file «NOME_FILE» e l’item nella collection «NOME_COLLECTION», poi collega il file al campo «nome_campo» (file/image/files).',
        anyOf: [
            PermissionEnum.CanShowFiles,
            PermissionEnum.CanEditCollections,
        ],
    },
    {
        id: 'save-attachment-to-files',
        category: 'file',
        title: 'Salva allegato chat nei File',
        description: 'Copia attachment nel file manager',
        prompt:
            'Salva l’allegato di questa chat nel File manager (cartella root o «percorso»). Poi dimmi id e percorso del file creato.',
        anyOf: [PermissionEnum.CanCreateFiles],
    },
    {
        id: 'create-role',
        category: 'admin',
        title: 'Crea ruolo con permessi',
        description: 'Nuovo ruolo Spatie + sync permission names',
        prompt:
            'Crea un ruolo chiamato «NOME_RUOLO» (es. gestore-prodotti). Prima elenca i permessi disponibili (list_permissions), poi assegna un set sensato via permission_names_json (usa i nomi esatti, es. can-show-collections, can-create-collections). Riepiloga id, nome e permessi finali. Non toccare super-admin.',
        anyOf: [PermissionEnum.CanCreateRoles],
    },
    {
        id: 'list-roles',
        category: 'admin',
        title: 'Elenca ruoli',
        description: 'Mostra ruoli e conteggio permessi',
        prompt:
            'Elenca i ruoli esistenti (id, nome, numero permessi). Se ne indico uno, mostra anche i permission names assegnati.',
        anyOf: [PermissionEnum.CanShowRoles],
    },
    {
        id: 'create-group',
        category: 'admin',
        title: 'Crea gruppo utenti',
        description: 'Gruppo con membri e ruoli collegati',
        prompt:
            'Crea un gruppo utenti «NOME_GRUPPO» con descrizione «…». Collega i ruoli «…» (role_names_json) e, se ti passo gli id, i membri. Riepiloga il risultato.',
        anyOf: [PermissionEnum.CanCreateGroups],
    },
    {
        id: 'create-user',
        category: 'admin',
        title: 'Crea utente',
        description: 'Nuovo utente con ruolo se possibile',
        prompt:
            'Crea un utente con email «…», nome e cognome «…». Assegna il ruolo se ho i permessi, altrimenti indica cosa manca.',
        anyOf: [PermissionEnum.CanCreateUsers],
    },
    {
        id: 'list-users',
        category: 'admin',
        title: 'Elenca utenti',
        description: 'Lista utenti attivi',
        prompt: 'Elenca gli utenti (id, nome, email). Filtra se ti indico un criterio.',
        anyOf: [PermissionEnum.CanShowUsers],
    },
    {
        id: 'audit-activity',
        category: 'admin',
        title: 'Audit attività',
        description: 'Cosa è successo di recente',
        prompt:
            'Usa QueryActivityLogs per recuperare le attività recenti rilevanti (collection, file, AI, auth). Filtra se serve per event/log_name/date e riassumile in italiano.',
        anyOf: [PermissionEnum.CanShowActivityLogs],
    },
    {
        id: 'async-large-import',
        category: 'avanzate',
        title: 'Import grande in background',
        description: 'Job asincrono con progress',
        prompt:
            'Importa questa fonte (allegato o URL) nella collection «NOME_COLLECTION» in modalità asincrona (async/job). Dammi il job_id e aggiornami sullo stato.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'scheduled-sync',
        category: 'avanzate',
        title: 'Sync schedulato da URL',
        description: 'Import periodico remoto',
        prompt:
            'Configura un sync periodico dalla URL https://… verso la collection «NOME_COLLECTION» con upsert sulla chiave «CAMPO». Intervallo: ogni N minuti. Conferma cosa hai creato.',
        anyOf: [PermissionEnum.CanCreateCollections, PermissionEnum.CanEditCollections],
    },
    {
        id: 'rollback-last-turn',
        category: 'avanzate',
        title: 'Annulla ultima operazione AI',
        description: 'Rollback soft delle mutazioni recenti',
        prompt:
            'Annulla (rollback) le mutazioni dell’ultimo turn AI in questa conversazione, se possibile con soft-delete. Dimmi cosa hai ripristinato e cosa non è annullabile.',
        anyOf: [PermissionEnum.CanDeleteCollections],
        destructive: true,
    },
];

export function filterAiActionPresets(
    presets: AiActionPreset[],
    can: (permission: string) => boolean,
): AiActionPreset[] {
    return presets.filter((preset) => {
        if (!preset.anyOf || preset.anyOf.length === 0) {
            return true;
        }

        return preset.anyOf.some((permission) => can(permission));
    });
}

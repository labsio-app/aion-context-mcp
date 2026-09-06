<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    busy?: boolean
    error?: string
  }>(),
  {
    busy: false,
    error: ''
  }
)

const emit = defineEmits<{
  delete: [confirmationPhrase: string]
}>()

const phrase = ref('')
</script>

<template>
  <section class="danger-zone">
    <header class="danger-header">
      <div>
        <p class="eyebrow danger">DANGER ZONE</p>
        <h3>Delete private beta account</h3>
      </div>
      <p class="danger-copy">
        Deleting your private beta account will revoke your MCP access and remove your personal beta
        profile. Shared AION research may be retained without your identity.
      </p>
    </header>

    <form class="danger-form" @submit.prevent="emit('delete', phrase)">
      <label class="field">
        <span>Type the exact confirmation phrase</span>
        <input
          v-model="phrase"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="DELETE MY AION MCP ACCOUNT"
        />
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button class="button danger" type="submit" :disabled="busy || !phrase.trim()">
        {{ busy ? 'Deleting…' : 'Delete account' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.danger-zone {
  padding: 14px;
  border: 1px solid rgba(255, 96, 120, 0.24);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(33, 10, 18, 0.9), rgba(15, 8, 14, 0.96)),
    radial-gradient(circle at top left, rgba(255, 96, 120, 0.12), transparent 46%);
}

.danger-header {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}

.danger-copy {
  max-width: 70ch;
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.6;
}

.danger-form {
  display: grid;
  gap: 14px;
}

.error {
  margin: 0;
  color: #ffd7dc;
}

@media (max-width: 700px) {
  .danger-zone {
    padding: 18px;
  }
}
</style>

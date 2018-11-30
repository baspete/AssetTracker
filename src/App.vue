<template>
  <div id="app">
    <p>{{ server }}</p>
    <p>{{ aircraft }}</p>
  </div>
</template>

<script>
export default {
  name: "app",
  data() {
    return {
      server: this.$server,
      aircraft: null
    };
  }
};
</script>

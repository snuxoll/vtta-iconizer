import utils from "./utils.js";
import SettingsExtender from "./settingsExtender.js";

SettingsExtender();

/**
 * Module initialisation, game settings registering
 */
export function init() {
  utils.log("Init");
  let debug = false;
  if (!CONFIG.debug.vtta) {
    CONFIG.debug.vtta = { iconizer: debug };
  } else {
    CONFIG.debug.vtta.iconizer = debug;
  }

  game.settings.register("vtta-iconizer", "replacement-policy", {
    name: "vtta-iconizer.replacement-policy.name",
    hint: "vtta-iconizer.replacement-policy.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    choices: [
      "vtta-iconizer.replacement-policy.0",
      "vtta-iconizer.replacement-policy.1",
      "vtta-iconizer.replacement-policy.2",
    ],
  });

  game.settings.register("vtta-iconizer", "icon-database-policy", {
    name: "vtta-iconizer.icon-database-policy.name",
    hint: "vtta-iconizer.icon-database-policy.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    choices: [
      "vtta-iconizer.icon-database-policy.0",
      "vtta-iconizer.icon-database-policy.1",
      "vtta-iconizer.icon-database-policy.2",
    ],
  });

  game.settings.register("vtta-iconizer", "base-dictionary", {
    name: "vtta-iconizer.base-dictionary.name",
    hint: "vtta-iconizer.base-dictionary.hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "foundry-icons.json": "Foundry Icons",
      "wow-icons.json": "World of Warcraft icons (offline, local icons)",
      "wowhead-icons.json": "World of Warcraft icons (online, wowhead.com)",
    },
    default: "foundry-icons.json",
  });

  // Relabeling "icon directory" to "icon prefix" setting
  game.settings.register("vtta-iconizer", "icon-directory", {
    name: "vtta-iconizer.icon-prefix.name",
    hint: "vtta-iconizer.icon-prefix.hint",
    scope: "world",
    config: true,
    type: Azzu.SettingsTypes.DirectoryPicker, // String,
    default: "iconizer",
  });

  // Submitting icons is a todo
  game.settings.register("vtta-iconizer", "share-missing-icons", {
    name: "vtta-iconizer.share-missing-icons.name",
    hint: "vtta-iconizer.share-missing-icons.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}

/**
 * Loading the icon database and registering the item-hooks to adjust the icon image accordingly
 */
export async function ready() {
  let iconData = new Map();
  let iconDatabasePolicy = game.settings.get(
    "vtta-iconizer",
    "icon-database-policy"
  );

  // load the base dictionary
  if (iconDatabasePolicy === 0 || iconDatabasePolicy === 1) {
    let path = `/modules/vtta-iconizer/data/${game.settings.get(
      "vtta-iconizer",
      "base-dictionary"
    )}`;

    let fileExists = await utils.serverFileExists(path);
    if (fileExists) {
      let response = await fetch(path, { method: "GET" });

      let json = await response.json();
      json.forEach((data) => {
        iconData.set(data.name.toLowerCase(), data.icon);
      });
    }
  }

  // load the custom icon database (if there is any)
  if (iconDatabasePolicy === 1 || iconDatabasePolicy === 2) {
    let path = `/${game.settings.get(
      "vtta-iconizer",
      "icon-directory"
    )}/icons.json`;
    let fileExists = await utils.serverFileExists(path);
    if (fileExists) {
      let response = await fetch(path, { method: "GET" });
      let json = await response.json();
      json.forEach((data) => {
        iconData.set(data.name.toLowerCase(), data.icon);
      });
    }
  }

  /**
   * Replaces the icon if the name changed and if the game settings allow that
   */
  let replaceIcon = (options) => {
    utils.log(options);
    // if there is no name change here, just continue
    if (!options || !options.name) return options;

    const REPLACEMENT_POLICY_REPLACE_ALL = 0;
    const REPLACEMENT_POLICY_REPLACE_DEFAULT = 1;
    const REPLACEMENT_POLICY_REPLACE_NONE = 2;

    let replacementPolicy = game.settings.get(
      "vtta-iconizer",
      "replacement-policy"
    );

    // stop right here if we should not replace anything
    if (replacementPolicy === REPLACEMENT_POLICY_REPLACE_NONE) return;

    if (
      replacementPolicy === REPLACEMENT_POLICY_REPLACE_ALL ||
      (replacementPolicy === REPLACEMENT_POLICY_REPLACE_DEFAULT &&
        (!options.img ||
          options.img.toLowerCase().indexOf("mystery-man") !== -1))
    ) {
      let name = options.name
        .toLowerCase()
        .replace(/\([^)]*\)/g, "")
        .trim();
      let newIcon = iconData.get(name);

      if (newIcon !== undefined) {
        // accept absolute references to icons and do not prefix with the icon directory
        if (
          newIcon.startsWith("/") ||
          newIcon.indexOf("://") === 0 ||
          newIcon.indexOf("http") === 0
        ) {
          options.img = newIcon;
        } else {
          // online references by wowhead-icons.json
          let baseDictionary = game.settings.get(
            "vtta-iconizer",
            "base-dictionary"
          );
          if (baseDictionary === "wowhead-icons.json") {
            options.img =
              "https://wow.zamimg.com/images/wow/icons/large" + "/" + newIcon;
          } else {
            options.img =
              game.settings.get("vtta-iconizer", "icon-directory") +
              "/" +
              newIcon;
          }
        }
      } else {
        if (replacementPolicy === 0) {
          //options.img = "icons/svg/mystery-man.svg";
        }
      }
      utils.log("Post-processing");
      utils.log(options);
    } else {
      utils.log("Not replacing icon");
    }

    return options;
  };

  /*
   * Submitting icons will be coming, need to prepare backend for it
   */
  let submitItem = (name, type, subType) => {
    const query = {
      name: name,
      type: type,
      subType: subType,
    };

    if (
      game.settings.get("vtta-iconizer", "share-missing-icons") &&
      query.subType &&
      game.system.id === "dnd5e" &&
      (game.settings.get("vtta-iconizer", "base-dictionary") ===
        "wow-icons.json" ||
        game.settings.get("vtta-iconizer", "base-dictionary") ===
          "wowhead-icons.json")
    ) {
      // It looks like an D&D Beyond import
      let url = `https://www.vttassets.com/api/iconizer/items/submit`;
      //let url = `http://localhost:3000/api/iconizer/items/submit`;
      console.log("VTTA Iconizer | Submitting item: ");
      console.log(query);
      try {
        fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(query),
        })
          .then((response) => {
            console.log(response);
            if (response.status === 200) {
              ui.notifications.info(
                "VTTA Iconizer | Item succesfully submitted: " +
                  query.name +
                  " / " +
                  query.type
              );
              console.log(
                "VTTA Iconizer | Item submitted successfully - thank you!"
              );
            }
          })
          .catch((error) => {
            console.log(error);
            utils.log("Error while sending the item data to VTTAssets");
            utils.log(error.message);
          })
          .finally(() => {
            console.log("Welp!");
          });
      } catch (error) {
        console.log(error);
      }
    }
  };

  // Hook on the item create events to replace the icon
  Hooks.on("preCreateItem", (createData, options) => {
    console.log("preCreateItem");
    options = replaceIcon(options);
  });

  Hooks.on("preCreateOwnedItem", (parent, createData, options) => {
    options = replaceIcon(options);
    console.log("+++++++++++++++++++++++++++++++++++++++");
    console.log(
      "preCreateOwnedItem almost finished, let's check if that item came from a Foundry import:"
    );
    console.log(options);

    console.log("Options.flags?" + options.flags);
    if (
      options.flags &&
      options.flags.vtta &&
      options.flags.vtta.dndbeyond &&
      options.flags.vtta.dndbeyond.type &&
      (options.img === undefined ||
        options.img.toLowerCase() === "icons/svg/mystery-man.svg")
    ) {
      submitItem(options.name, options.type, options.flags.vtta.dndbeyond.type);
    }
    console.log("preCreateOwnedItem finshed");
  });

  Hooks.on("preUpdateItem", (createData, options) => {
    utils.log("preUpdateItem");
    if (!options.img) {
      options.img = createData.img;
    }
    options = replaceIcon(options);
  });

  Hooks.on("preUpdateOwnedItem", (parent, createData, options) => {
    utils.log("preUpdateOwnedItem");
    if (!options.img) {
      let item = parent.getEmbeddedEntity("OwnedItem", options._id);
      if (item) {
        options.img = item.img;
      }
    }
    options = replaceIcon(options);
  });

  document.addEventListener("queryIcon", (event) => {
    if (event.detail && event.detail.name) {
      let response = replaceIcon({ name: event.detail.name });
      document.dispatchEvent(new CustomEvent("deliverIcon", response));
      utils.log("queryIcon");
      utils.log(response);
    }
  });

  document.addEventListener("queryIcons", (event) => {
    if (
      event.detail &&
      event.detail.names &&
      Array.isArray(event.detail.names)
    ) {
      let response = [];
      for (let name of event.detail.names) {
        let result = replaceIcon(name);
        response.push(replaceIcon(name));
      }

      document.dispatchEvent(
        new CustomEvent("deliverIcon", { detail: response })
      );
    }
  });
}

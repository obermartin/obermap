const regex = /inset\(([-\d.]+)%?/;
const clipStr = "inset(0 100% 0 0)";
const match = clipStr.match(regex);
console.log(match);

const str2 = "inset(0px 100% 0px 0px)";
const parts = str2.replace('inset(', '').replace(')', '').split(' ');
console.log(parts);
console.log(parseFloat(parts[1]));


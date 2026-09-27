import {execFileSync} from 'node:child_process';
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n');
const forbidden=paths.filter(p=>/(^|\/)(internal|\.ocean)(\/|$)|(^|\/)\.env(?!\.example$)|\.(pem|key)$/.test(p));
if(forbidden.length){console.error('Private boundary violation:',forbidden);process.exit(1);}
console.log('Repository boundary checked: no internal strategy, environment secrets or private keys.');

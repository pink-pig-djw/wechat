import { useRef, useState } from 'react';
import { useStore } from '../../lib/store.js';
import { updateProfile } from '../../lib/actions.js';
import { uploadFile } from '../../lib/api.js';
import { genderLabel } from '../../lib/format.js';
import { openMenu, promptDialog, toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Cell, CellGroup, PageHeader, Spinner } from '../../components/ui.jsx';

export default function EditProfile() {
  const me = useStore((s) => s.me);
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);

  const save = (patch, success = '已保存') =>
    updateProfile(patch)
      .then(() => toast(success))
      .catch(toastError);

  const edit = async (field, title, { maxLength, multiline } = {}) => {
    const value = await promptDialog({ title, value: me[field] ?? '', maxLength, multiline, allowEmpty: field !== 'nickname' });
    if (value !== null && value !== me[field]) save({ [field]: value });
  };

  const chooseGender = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu({
      x: r.right - 140,
      y: r.bottom,
      title: '性别',
      items: [
        { label: '男', onClick: () => save({ gender: 1 }) },
        { label: '女', onClick: () => save({ gender: 2 }) },
        { label: '不显示', onClick: () => save({ gender: 0 }) },
      ],
    });
  };

  const onAvatarFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, { kind: 'image' });
      await save({ avatar: url }, '头像已更新');
    } catch (err) {
      toastError(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="个人资料" back="/me" />
      <div className="page-scroll">
        <CellGroup>
          <Cell label="头像" onClick={() => fileInput.current.click()} className="avatar-cell">
            <span className="avatar-edit">
              <Avatar src={me.avatar} name={me.nickname} seed={me.id} size={56} radius={6} />
              {uploading && (
                <span className="avatar-uploading">
                  <Spinner size={18} />
                </span>
              )}
            </span>
          </Cell>
          <Cell label="名字" value={me.nickname} onClick={() => edit('nickname', '更改名字', { maxLength: 20 })} />
          <Cell label="泡泡号" value={me.username} arrow={false} />
        </CellGroup>
        <CellGroup>
          <Cell label="性别" value={genderLabel(me.gender) || '未设置'} onClick={chooseGender} />
          <Cell label="地区" value={me.region || '未设置'} onClick={() => edit('region', '设置地区', { maxLength: 30 })} />
          <Cell label="个性签名" value={me.signature || '未填写'} onClick={() => edit('signature', '个性签名', { maxLength: 60, multiline: true })} />
        </CellGroup>
        {me.avatar && (
          <CellGroup>
            <Cell label="移除头像" danger center arrow={false} onClick={() => save({ avatar: null }, '已移除头像')} />
          </CellGroup>
        )}
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={onAvatarFile} />
    </div>
  );
}
